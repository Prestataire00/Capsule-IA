'use server';

import { createHash, randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { env } from '@/env.mjs';
import { supabaseServer } from '@/shared/lib/supabase/server';
import { generateSignatureToken } from '@/shared/lib/signature-token';
import { parseZoomCsv } from '@/features/attendance/zoom-csv-parser';
import { renderAttendancePdf, type PdfSignatureLine } from '@/features/attendance/pdf-render';

const admin = () =>
  createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

const ATTENDANCE_THRESHOLD = 0.75;

export type GenerateParticipantLinkResult =
  | { ok: true; url: string; expiresAt: string }
  | { ok: false; error: string };

export async function generateParticipantSignatureLink(input: {
  sheetId: string;
  participantId: string;
  participantKind: 'learner' | 'trainer';
}): Promise<GenerateParticipantLinkResult> {
  if (!env.PUBLIC_APP_URL) return { ok: false, error: 'public_app_url_missing' };

  const signed = await generateSignatureToken({
    attendanceSheetId: input.sheetId,
    signerId: input.participantId,
    signerKind: input.participantKind,
  });

  return {
    ok: true,
    url: `${env.PUBLIC_APP_URL.replace(/\/$/, '')}/signer/${signed.token}`,
    expiresAt: signed.expiresAt.toISOString(),
  };
}

export type FinalizeResult =
  | { ok: true; documentId: string; documentPath: string; hash: string }
  | { ok: false; error: string };

export async function finalizeAttendanceSheet(input: {
  sheetId: string;
  actorUserId: string | null;
}): Promise<FinalizeResult> {
  const sb = admin();

  // 1. Charger sheet + contexte (dossier, session, organization)
  const { data: sheetData } = await sb
    .schema('app')
    .from('attendance_sheets')
    .select(
      `
      id, status, half_day, organization_id, dossier_id, session_id,
      sessions(starts_at, ends_at, modality, location, title),
      dossiers(reference, formations(title)),
      organizations(name, logo_url)
    `,
    )
    .eq('id', input.sheetId)
    .maybeSingle();
  if (!sheetData) return { ok: false, error: 'sheet_not_found' };

  const sheet = sheetData as unknown as {
    id: string;
    status: string;
    half_day: 'morning' | 'afternoon' | 'full' | 'evening';
    organization_id: string;
    dossier_id: string;
    session_id: string;
    sessions: { starts_at: string; ends_at: string; modality: string; location: string | null; title: string | null } | null;
    dossiers: { reference: string; formations: { title: string } | null } | null;
    organizations: { name: string; logo_url: string | null } | null;
  };
  if (sheet.status === 'finalized') return { ok: false, error: 'already_finalized' };
  if (!sheet.sessions) return { ok: false, error: 'session_dates_missing' };

  // 2. Charger signatures + participants pour le PDF
  const [{ data: sigsData }, { data: partsData }] = await Promise.all([
    sb
      .schema('app')
      .from('attendance_signatures')
      .select(
        'participant_kind, learner_id, trainer_id, status, signed_at, signer_ip, signer_country, evidence_source, signature_image_path',
      )
      .eq('attendance_sheet_id', input.sheetId),
    sb
      .schema('app')
      .from('session_participants')
      .select(
        'participant_kind, learner_id, trainer_id, learner:learners(first_name, last_name), trainer:trainers(first_name, last_name)',
      )
      .eq('session_id', sheet.session_id),
  ]);

  type SigRow = {
    participant_kind: 'learner' | 'trainer';
    learner_id: string | null;
    trainer_id: string | null;
    status: 'present' | 'absent' | 'late' | 'excused' | null;
    signed_at: string | null;
    signer_ip: string | null;
    signer_country: string | null;
    evidence_source: PdfSignatureLine['evidenceSource'];
    signature_image_path: string | null;
  };
  type PartRow = {
    participant_kind: 'learner' | 'trainer';
    learner_id: string | null;
    trainer_id: string | null;
    learner: { first_name: string; last_name: string } | null;
    trainer: { first_name: string; last_name: string } | null;
  };

  const sigs = (sigsData ?? []) as unknown as SigRow[];
  const parts = (partsData ?? []) as unknown as PartRow[];

  const nameOf = (kind: 'learner' | 'trainer', id: string | null): string => {
    const p = parts.find(
      (x) => x.participant_kind === kind && (kind === 'learner' ? x.learner_id : x.trainer_id) === id,
    );
    if (!p) return 'Participant inconnu';
    const person = kind === 'learner' ? p.learner : p.trainer;
    return person ? `${person.first_name} ${person.last_name}` : 'Participant inconnu';
  };

  // 3. Générer signed URLs (TTL 5 min) pour chaque PNG signature
  const signedUrls = new Map<string, string>();
  for (const sig of sigs) {
    if (!sig.signature_image_path) continue;
    const { data: u } = await sb.storage
      .from('signatures')
      .createSignedUrl(sig.signature_image_path, 300);
    if (u?.signedUrl) signedUrls.set(sig.signature_image_path, u.signedUrl);
  }

  const lines: PdfSignatureLine[] = sigs.map((s) => ({
    participantKind: s.participant_kind,
    fullName: nameOf(s.participant_kind, s.participant_kind === 'learner' ? s.learner_id : s.trainer_id),
    status: s.status,
    signedAt: s.signed_at,
    signerIp: s.signer_ip,
    signerCountry: s.signer_country,
    evidenceSource: s.evidence_source ?? 'manual',
    signatureSignedUrl: s.signature_image_path ? signedUrls.get(s.signature_image_path) ?? null : null,
  }));

  // 4. Render PDF
  let pdfBuffer: Buffer;
  try {
    pdfBuffer = await renderAttendancePdf({
      sheetId: sheet.id,
      halfDay: sheet.half_day,
      dossierReference: sheet.dossiers?.reference ?? '—',
      formationTitle: sheet.dossiers?.formations?.title ?? sheet.sessions.title ?? '—',
      organizationName: sheet.organizations?.name ?? '—',
      organizationLogoUrl: sheet.organizations?.logo_url ?? null,
      sessionStartsAt: new Date(sheet.sessions.starts_at),
      sessionEndsAt: new Date(sheet.sessions.ends_at),
      modality: sheet.sessions.modality,
      location: sheet.sessions.location,
      lines,
    });
  } catch (e) {
    return { ok: false, error: `pdf_render_failed:${(e as Error).message}` };
  }

  const pdfHash = createHash('sha256').update(pdfBuffer).digest('hex');

  // 5. Upload bucket documents
  const documentId = randomUUID();
  const storagePath = `${sheet.organization_id}/emargements/${sheet.id}.pdf`;
  const upload = await sb.storage
    .from('documents')
    .upload(storagePath, pdfBuffer, { contentType: 'application/pdf', upsert: true });
  if (upload.error) {
    return { ok: false, error: `storage_upload_failed:${upload.error.message}` };
  }

  // 6. INSERT app.documents
  const { error: docErr } = await sb
    .schema('app')
    .from('documents')
    .insert({
      id: documentId,
      organization_id: sheet.organization_id,
      dossier_id: sheet.dossier_id,
      kind: 'feuille_emargement_signee',
      title: `Émargement ${sheet.dossiers?.reference ?? sheet.id} — ${sheet.half_day}`,
      status: 'ready',
      storage_path: storagePath,
      mime_type: 'application/pdf',
      file_size_bytes: pdfBuffer.length,
      file_hash: pdfHash,
      generated_at: new Date().toISOString(),
      metadata: { attendance_sheet_id: sheet.id },
    });
  if (docErr) return { ok: false, error: `documents_insert_failed:${docErr.message}` };

  // 7. UPDATE sheet (transition open→finalized en 1 step, trigger 0033 ne bloque pas)
  const { error: updateErr } = await sb
    .schema('app')
    .from('attendance_sheets')
    .update({
      status: 'finalized',
      finalized_at: new Date().toISOString(),
      finalized_by: input.actorUserId,
      document_id: documentId,
    })
    .eq('id', sheet.id)
    .neq('status', 'finalized');
  if (updateErr) return { ok: false, error: `finalize_update_failed:${updateErr.message}` };

  return { ok: true, documentId, documentPath: storagePath, hash: pdfHash };
}

export type GetDownloadUrlResult =
  | { ok: true; url: string }
  | { ok: false; error: string };

export async function getDocumentDownloadUrl(input: {
  documentId: string;
}): Promise<GetDownloadUrlResult> {
  const sb = admin();
  const { data: doc } = await sb
    .schema('app')
    .from('documents')
    .select('storage_path')
    .eq('id', input.documentId)
    .maybeSingle();
  if (!doc) return { ok: false, error: 'document_not_found' };
  const path = (doc as { storage_path: string | null }).storage_path;
  if (!path) return { ok: false, error: 'storage_path_missing' };

  const { data: signed } = await sb.storage.from('documents').createSignedUrl(path, 60);
  if (!signed?.signedUrl) return { ok: false, error: 'signed_url_failed' };
  return { ok: true, url: signed.signedUrl };
}

export type ImportZoomCsvResult =
  | {
      ok: true;
      totalRows: number;
      matched: number;
      unmatched: number;
      unmatchedPreview: Array<{ email: string | null; name: string | null; durationMinutes: number }>;
    }
  | { ok: false; error: string };

export async function importZoomCsv(input: {
  sheetId: string;
  sessionId: string;
  csvContent: string;
  csvFilename: string;
}): Promise<ImportZoomCsvResult> {
  const sb = admin();

  // 1. Vérifier sheet non finalisée + récup org + duration session
  const { data: sheetData } = await sb
    .schema('app')
    .from('attendance_sheets')
    .select('id, status, organization_id, sessions(starts_at, ends_at)')
    .eq('id', input.sheetId)
    .maybeSingle();
  if (!sheetData) return { ok: false, error: 'sheet_not_found' };
  const sheet = sheetData as unknown as {
    id: string;
    status: string;
    organization_id: string;
    sessions: { starts_at: string; ends_at: string } | null;
  };
  if (sheet.status === 'finalized') return { ok: false, error: 'sheet_finalized' };
  if (!sheet.sessions) return { ok: false, error: 'session_dates_missing' };
  const sessionMinutes = Math.round(
    (new Date(sheet.sessions.ends_at).getTime() - new Date(sheet.sessions.starts_at).getTime()) / 60_000,
  );

  // 2. Parser CSV
  const parsed = parseZoomCsv(input.csvContent);
  if (!parsed.ok) return { ok: false, error: `parse_failed:${parsed.error.code}` };

  // 3. Récupérer participants learners de la session avec email
  const { data: partRows } = await sb
    .schema('app')
    .from('session_participants')
    .select('learner_id, learners(email)')
    .eq('session_id', input.sessionId)
    .eq('participant_kind', 'learner');
  const lookup = new Map<string, string>();
  for (const p of (partRows ?? []) as unknown as Array<{ learner_id: string | null; learners: { email: string | null } | null }>) {
    const email = p.learners?.email?.toLowerCase().trim();
    if (email && p.learner_id) lookup.set(email, p.learner_id);
  }

  // 4. Upload CSV brut dans bucket audit (best-effort)
  try {
    await sb.storage.from('zoom_imports').upload(
      `${input.sheetId}/${Date.now()}-${input.csvFilename}`,
      input.csvContent,
      { contentType: 'text/csv', upsert: false },
    );
  } catch {
    // bucket peut ne pas être déployé en local — non bloquant
  }

  // 5. Matching + appel RPC v2 pour chaque ligne matched
  let matched = 0;
  const unmatchedRows: typeof parsed.rows = [];

  for (const row of parsed.rows) {
    const key = row.email?.toLowerCase().trim();
    const learnerId = key ? lookup.get(key) : undefined;
    if (!learnerId) {
      unmatchedRows.push(row);
      continue;
    }
    const statusComputed: 'present' | 'late' =
      row.durationMinutes >= ATTENDANCE_THRESHOLD * sessionMinutes ? 'present' : 'late';
    const hash = createHash('sha256').update(row.rawLine).digest('hex');

    const { error } = await sb.schema('app').rpc('record_attendance_signature' as never, {
      p_attendance_sheet_id: input.sheetId,
      p_signer_id: learnerId,
      p_signer_kind: 'learner',
      p_image_path: null,
      p_signature_hash: hash,
      p_signer_ip: '0.0.0.0',
      p_signer_user_agent: 'zoom-csv-import',
      p_signer_country: null,
      p_token_jti: null,
      p_evidence_source: 'zoom_csv',
      p_evidence_payload: {
        joinTime: row.joinTime?.toISOString() ?? null,
        leaveTime: row.leaveTime?.toISOString() ?? null,
        durationMinutes: row.durationMinutes,
        statusComputed,
        rawLine: row.rawLine,
      },
    } as never);
    if (error) {
      // Sans trace, un échec RPC se traduisait par « 0 ligne rapprochée » sans cause.
      console.error('[zoom-csv] record_attendance_signature a échoué', error);
      continue;
    }
    matched++;
  }

  // 6. INSERT unmatched rows
  if (unmatchedRows.length > 0) {
    const insertRows = unmatchedRows.map((u) => ({
      organization_id: sheet.organization_id,
      attendance_sheet_id: input.sheetId,
      source: 'zoom_csv',
      raw_email: u.email,
      raw_name: u.name,
      join_time: u.joinTime?.toISOString() ?? null,
      leave_time: u.leaveTime?.toISOString() ?? null,
      duration_minutes: u.durationMinutes,
    }));
    await sb.schema('app').from('zoom_import_unmatched').insert(insertRows);
  }

  return {
    ok: true,
    totalRows: parsed.rows.length,
    matched,
    unmatched: unmatchedRows.length,
    unmatchedPreview: unmatchedRows.slice(0, 10).map((r) => ({
      email: r.email,
      name: r.name,
      durationMinutes: r.durationMinutes,
    })),
  };
}

export type EnsureSheetsResult =
  | { ok: true; created: number }
  | { ok: false; error: string };

/** Garde multi-tenant : l'appelant ne peut agir que sur une séance de SON organisation (vérifié via RLS). */
async function assertSessionAccess(sessionId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const sb = supabaseServer();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return { ok: false, error: 'unauthenticated' };
  const { data } = await sb.schema('app').from('sessions').select('id').eq('id', sessionId).maybeSingle();
  if (!data) return { ok: false, error: 'forbidden' };
  return { ok: true };
}

/** Matérialise (idempotent) les feuilles matin/après-midi de la séance via la RPC. */
export async function ensureSessionSheets(sessionId: string): Promise<EnsureSheetsResult> {
  const access = await assertSessionAccess(sessionId);
  if (!access.ok) return { ok: false, error: access.error };
  const sb = admin();
  const { data, error } = await sb
    .schema('app')
    .rpc('materialize_attendance_slots' as never, { p_session_id: sessionId } as never);
  if (error) return { ok: false, error: error.message };
  return { ok: true, created: (data as number | null) ?? 0 };
}

export type ConvertLegacyResult =
  | { ok: true; created: number }
  | { ok: false; error: string };

/**
 * Convertit une feuille 'full' legacy VIERGE (0 signature, non finalisée) en
 * feuilles demi-journée. Refuse si des signatures existent / déjà finalisée
 * (preuve légale intouchable).
 */
export async function convertLegacyFullSheet(sessionId: string): Promise<ConvertLegacyResult> {
  const access = await assertSessionAccess(sessionId);
  if (!access.ok) return { ok: false, error: access.error };
  const sb = admin();

  const { data: full } = await sb
    .schema('app')
    .from('attendance_sheets')
    .select('id, status')
    .eq('session_id', sessionId)
    .eq('half_day', 'full')
    .maybeSingle();
  if (!full) return { ok: false, error: 'no_full_sheet' };
  const fullSheet = full as { id: string; status: string };
  if (fullSheet.status === 'finalized') return { ok: false, error: 'full_sheet_finalized' };

  const { count } = await sb
    .schema('app')
    .from('attendance_signatures')
    .select('*', { count: 'exact', head: true })
    .eq('attendance_sheet_id', fullSheet.id);
  if ((count ?? 0) > 0) return { ok: false, error: 'full_sheet_has_signatures' };

  const { error: delErr } = await sb
    .schema('app')
    .from('attendance_sheets')
    .delete()
    .eq('id', fullSheet.id);
  if (delErr) return { ok: false, error: delErr.message };

  const { data, error } = await sb
    .schema('app')
    .rpc('materialize_attendance_slots' as never, { p_session_id: sessionId } as never);
  if (error) return { ok: false, error: error.message };
  return { ok: true, created: (data as number | null) ?? 0 };
}
