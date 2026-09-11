'use server';

import { createHash, randomUUID } from 'node:crypto';
import { env } from '@/env.mjs';
import { supabaseAdmin } from '@/shared/lib/supabase/admin';
import { supabaseServer } from '@/shared/lib/supabase/server';
import { parseZoomCsv } from '@/features/attendance/zoom-csv-parser';
import { renderAttendancePdf, type PdfSignatureLine } from '@/features/attendance/pdf-render';
import { accessibleSession, accessibleSheet } from '@/features/attendance/access';
import { issueAttendanceLink } from '@/features/attendance/issue-attendance-link';
import { recordAttendanceStep } from '@/features/attendance/record-step';
import { sendSheetLinks, type SendLinksResult } from '@/features/attendance/send-links';
import { loadSessionEmargement } from '@/features/attendance/queries/load-session-emargement';
import { attendanceErrorCode, deviceSignatureSchema, markSchema, type DeviceSignatureInput, type MarkInput } from '@/features/attendance/schemas';

/**
 * Actions d'émargement de l'équipe et du formateur.
 *
 * Toutes écrivent en service role : chacune vérifie d'abord, sous RLS, que
 * l'utilisateur voit la feuille (ou la séance) visée — équipe de l'organisme
 * ou formateur de la séance. Elles n'agissaient jusqu'ici sur aucune garde.
 */

const ATTENDANCE_THRESHOLD = 0.75;

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

async function estAttendu(sessionId: string, kind: 'learner' | 'trainer', id: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin()
    .schema('app')
    .rpc('session_expected_signers' as never, { p_session_id: sessionId } as never);
  if (error) return false;
  return ((data ?? []) as { participant_kind: string; participant_id: string }[]).some(
    (e) => e.participant_kind === kind && e.participant_id === id,
  );
}

// ── Lien personnel ─────────────────────────────────────────────────────────
export async function generateParticipantSignatureLink(input: {
  sheetId: string;
  participantId: string;
  participantKind: 'learner' | 'trainer';
}): Promise<Result<{ url: string; expiresAt: string }>> {
  const acces = await accessibleSheet(input.sheetId);
  if (!acces.ok) return { ok: false, error: acces.error };
  if (!env.PUBLIC_APP_URL) return { ok: false, error: 'public_app_url_missing' };
  if (!(await estAttendu(acces.value.session_id, input.participantKind, input.participantId))) {
    return { ok: false, error: 'signer_not_expected' };
  }
  const r = await issueAttendanceLink({
    sheetId: input.sheetId,
    signerId: input.participantId,
    signerKind: input.participantKind,
    baseUrl: env.PUBLIC_APP_URL,
  });
  if (!r.ok) return { ok: false, error: r.error };
  return { ok: true, url: r.link.url, expiresAt: r.link.expiresAt.toISOString() };
}

// ── Grille : présent, retard, absent, excusé, départ anticipé ──────────────
export async function markAttendance(input: MarkInput): Promise<Result> {
  const p = markSchema.safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? 'saisie_invalide' };
  const acces = await accessibleSheet(p.data.sheetId);
  if (!acces.ok) return { ok: false, error: acces.error };

  const { error } = await supabaseAdmin().schema('app').rpc('set_attendance_mark' as never, {
    p_attendance_sheet_id: p.data.sheetId,
    p_learner_id: p.data.learnerId,
    p_status: p.data.status,
    p_late_arrival: p.data.lateArrival ?? null,
    p_early_departure: p.data.earlyDeparture ?? null,
    p_reason: p.data.reason ?? null,
    p_capture_mode: p.data.captureMode,
    p_actor: acces.userId,
  } as never);
  if (error) {
    const code = attendanceErrorCode(error.message);
    if (code === 'erreur_inconnue') console.error('[émargement] marquage refusé', error);
    return { ok: false, error: code === 'erreur_inconnue' ? error.message : code };
  }
  return { ok: true };
}

// ── Envoi des liens par e-mail (bouton de l'équipe) ────────────────────────
export async function sendSheetLinksAction(input: { sheetId: string }): Promise<Result<SendLinksResult>> {
  const acces = await accessibleSheet(input.sheetId);
  if (!acces.ok) return { ok: false, error: acces.error };
  if (!env.PUBLIC_APP_URL) return { ok: false, error: 'public_app_url_missing' };
  if (acces.value.status === 'finalized') return { ok: false, error: 'attendance_sheet_finalized' };
  const r = await sendSheetLinks(input.sheetId, 'manuel', env.PUBLIC_APP_URL);
  return { ok: true, ...r };
}

// ── Tablette : la personne signe sur l'appareil de l'organisme ─────────────
export async function signOnDevice(input: DeviceSignatureInput): Promise<Result<{ status: string; lateArrival: string | null; earlyDeparture: string | null }>> {
  const p = deviceSignatureSchema.safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? 'saisie_invalide' };
  const acces = await accessibleSheet(p.data.sheetId);
  if (!acces.ok) return { ok: false, error: acces.error };

  const r = await recordAttendanceStep({
    sheetId: p.data.sheetId,
    signerId: p.data.signerId,
    signerKind: p.data.signerKind,
    moment: p.data.moment,
    dataUrl: p.data.dataUrl,
    tokenJti: null,
    captureMode: 'tablette',
    actorUserId: acces.userId,
  });
  if (!r.ok) return r;
  return { ok: true, status: r.status, lateArrival: r.lateArrival, earlyDeparture: r.earlyDeparture };
}

// ── Clôture ─────────────────────────────────────────────────────────────────
export type FinalizeResult = Result<{ documentId: string; documentPath: string; hash: string }>;

export async function finalizeAttendanceSheet(input: { sheetId: string }): Promise<FinalizeResult> {
  const acces = await accessibleSheet(input.sheetId);
  if (!acces.ok) return { ok: false, error: acces.error };
  const ref = acces.value;
  if (ref.status === 'finalized') return { ok: false, error: 'attendance_sheet_finalized' };

  // Même règle que l'écran, vérifiée côté serveur.
  const vue = await loadSessionEmargement(supabaseServer(), ref.session_id);
  const feuille = vue?.sheets.find((sh) => sh.id === ref.id);
  if (!vue || !feuille) return { ok: false, error: 'attendance_sheet_not_found' };
  if (!feuille.ready) return { ok: false, error: 'sheet_incomplete' };

  const sb = supabaseAdmin();
  const [{ data: ctxData }, { data: sigsData }] = await Promise.all([
    sb
      .schema('app')
      .from('attendance_sheets')
      .select('dossiers(reference, formations(title)), sessions(title, formation:formations(title)), organizations(name, logo_url)')
      .eq('id', ref.id)
      .maybeSingle(),
    sb
      .schema('app')
      .from('attendance_signatures')
      .select('participant_kind, learner_id, trainer_id, signer_ip, signer_country, evidence_source, signature_image_path')
      .eq('attendance_sheet_id', ref.id),
  ]);
  const ctx = ctxData as unknown as {
    dossiers: { reference: string; formations: { title: string } | null } | null;
    sessions: { title: string | null; formation: { title: string } | null } | null;
    organizations: { name: string; logo_url: string | null } | null;
  } | null;
  type Sig = {
    participant_kind: 'learner' | 'trainer';
    learner_id: string | null;
    trainer_id: string | null;
    signer_ip: string | null;
    signer_country: string | null;
    evidence_source: PdfSignatureLine['evidenceSource'] | null;
    signature_image_path: string | null;
  };
  const sigs = new Map<string, Sig>();
  for (const g of (sigsData ?? []) as unknown as Sig[]) sigs.set(`${g.participant_kind}:${g.learner_id ?? g.trainer_id}`, g);

  const lines: PdfSignatureLine[] = [];
  for (const p of feuille.participants) {
    const g = sigs.get(`${p.kind}:${p.id}`);
    let url: string | null = null;
    if (g?.signature_image_path) {
      const { data: u } = await sb.storage.from('signatures').createSignedUrl(g.signature_image_path, 300);
      url = u?.signedUrl ?? null;
    }
    lines.push({
      participantKind: p.kind,
      fullName: p.fullName,
      status:
        p.status === 'absent_justified' ? 'excused' : p.status === 'remote' ? 'present' : (p.status ?? 'absent'),
      signedAt: p.entryAt ?? p.attestedAt,
      signerIp: g?.signer_ip ?? null,
      signerCountry: g?.signer_country ?? null,
      evidenceSource: g?.evidence_source ?? 'manual',
      signatureSignedUrl: url,
    });
  }

  let pdf: Buffer;
  try {
    pdf = await renderAttendancePdf({
      sheetId: ref.id,
      halfDay: feuille.halfDay,
      dossierReference: ctx?.dossiers?.reference ?? 'Session de groupe',
      formationTitle: ctx?.dossiers?.formations?.title ?? ctx?.sessions?.formation?.title ?? ctx?.sessions?.title ?? '—',
      organizationName: ctx?.organizations?.name ?? '—',
      organizationLogoUrl: ctx?.organizations?.logo_url ?? null,
      sessionStartsAt: new Date(vue.session.startsAt),
      sessionEndsAt: new Date(vue.session.endsAt),
      modality: vue.session.modality,
      location: vue.session.location,
      lines,
    });
  } catch (e) {
    console.error('[émargement] PDF non généré', e);
    return { ok: false, error: 'pdf_render_failed' };
  }

  const hash = createHash('sha256').update(pdf).digest('hex');
  const documentId = randomUUID();
  const chemin = `${ref.organization_id}/emargements/${ref.id}-${documentId}.pdf`;
  const up = await sb.storage.from('documents').upload(chemin, pdf, { contentType: 'application/pdf', upsert: false });
  if (up.error) return { ok: false, error: 'storage_upload_failed' };

  const { error: docErr } = await sb
    .schema('app')
    .from('documents')
    .insert({
      id: documentId,
      organization_id: ref.organization_id,
      dossier_id: ref.dossier_id,
      kind: 'feuille_emargement_signee',
      title: `Émargement ${ctx?.dossiers?.reference ?? vue.session.title ?? ''} — ${feuille.halfDay}`.trim(),
      status: 'ready',
      storage_path: chemin,
      mime_type: 'application/pdf',
      file_size_bytes: pdf.length,
      file_hash: hash,
      generated_at: new Date().toISOString(),
      metadata: { attendance_sheet_id: ref.id },
    } as never);
  if (docErr) {
    await sb.storage.from('documents').remove([chemin]);
    return { ok: false, error: 'documents_insert_failed' };
  }

  const { error: majErr } = await sb
    .schema('app')
    .from('attendance_sheets')
    .update({ status: 'finalized', finalized_at: new Date().toISOString(), finalized_by: acces.userId, document_id: documentId })
    .eq('id', ref.id)
    .neq('status', 'finalized');
  if (majErr) {
    // La feuille n'est pas clôturée : on ne laisse pas un PDF orphelin présenté comme définitif.
    await sb.schema('app').from('documents').delete().eq('id', documentId);
    await sb.storage.from('documents').remove([chemin]);
    return { ok: false, error: 'finalize_update_failed' };
  }
  return { ok: true, documentId, documentPath: chemin, hash };
}

// ── Téléchargement du PDF clôturé ───────────────────────────────────────────
export async function getDocumentDownloadUrl(input: { documentId: string }): Promise<Result<{ url: string }>> {
  const sb = supabaseServer();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return { ok: false, error: 'unauthenticated' };
  // Visible sous RLS : sinon, un identifiant suffisait à télécharger n'importe quel document.
  const { data: doc } = await sb.schema('app').from('documents').select('storage_path').eq('id', input.documentId).maybeSingle();
  const chemin = (doc as { storage_path: string | null } | null)?.storage_path;
  if (!chemin) return { ok: false, error: 'forbidden' };
  const { data: signed } = await supabaseAdmin().storage.from('documents').createSignedUrl(chemin, 60);
  if (!signed?.signedUrl) return { ok: false, error: 'signed_url_failed' };
  return { ok: true, url: signed.signedUrl };
}

// ── Import Zoom (CSV) ───────────────────────────────────────────────────────
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
  const acces = await accessibleSheet(input.sheetId);
  if (!acces.ok) return { ok: false, error: acces.error };
  if (acces.value.session_id !== input.sessionId) return { ok: false, error: 'forbidden' };
  if (acces.value.status === 'finalized') return { ok: false, error: 'attendance_sheet_finalized' };

  const sb = supabaseAdmin();
  const { data: sessionRow } = await sb.schema('app').from('sessions').select('starts_at, ends_at').eq('id', input.sessionId).maybeSingle();
  const session = sessionRow as { starts_at: string; ends_at: string } | null;
  if (!session) return { ok: false, error: 'session_dates_missing' };
  const sessionMinutes = Math.round((new Date(session.ends_at).getTime() - new Date(session.starts_at).getTime()) / 60_000);

  const parsed = parseZoomCsv(input.csvContent);
  if (!parsed.ok) return { ok: false, error: `parse_failed:${parsed.error.code}` };

  // Rapprochement par e-mail, parmi les apprenants attendus.
  const { data: attendus } = await sb.schema('app').rpc('session_expected_signers' as never, { p_session_id: input.sessionId } as never);
  const learnerIds = ((attendus ?? []) as { participant_kind: string; participant_id: string }[])
    .filter((e) => e.participant_kind === 'learner')
    .map((e) => e.participant_id);
  const { data: learners } = learnerIds.length
    ? await sb.schema('app').from('learners').select('id, email').in('id', learnerIds)
    : { data: [] };
  const parEmail = new Map<string, string>();
  for (const l of (learners ?? []) as { id: string; email: string | null }[]) {
    const e = l.email?.toLowerCase().trim();
    if (e) parEmail.set(e, l.id);
  }

  const { error: archiveErr } = await sb.storage
    .from('zoom_imports')
    .upload(`${input.sheetId}/${Date.now()}-${input.csvFilename}`, input.csvContent, { contentType: 'text/csv', upsert: false });
  if (archiveErr) console.error('[zoom-csv] archive du fichier impossible', archiveErr.message);

  let matched = 0;
  const unmatchedRows: typeof parsed.rows = [];
  for (const row of parsed.rows) {
    const learnerId = row.email ? parEmail.get(row.email.toLowerCase().trim()) : undefined;
    if (!learnerId) {
      unmatchedRows.push(row);
      continue;
    }
    // Précédence humaine : une signature n'est jamais remplacée par un journal Zoom.
    const { error } = await sb.schema('app').rpc('record_zoom_attendance' as never, {
      p_attendance_sheet_id: input.sheetId,
      p_learner_id: learnerId,
      p_status: row.durationMinutes >= ATTENDANCE_THRESHOLD * sessionMinutes ? 'present' : 'late',
      p_signature_hash: createHash('sha256').update(row.rawLine).digest('hex'),
      p_evidence_source: 'zoom_csv',
      p_evidence_payload: {
        joinTime: row.joinTime?.toISOString() ?? null,
        leaveTime: row.leaveTime?.toISOString() ?? null,
        durationMinutes: row.durationMinutes,
        rawLine: row.rawLine,
      },
    } as never);
    if (error) {
      console.error('[zoom-csv] enregistrement refusé', error);
      continue;
    }
    matched++;
  }

  if (unmatchedRows.length > 0) {
    await sb.schema('app').from('zoom_import_unmatched').insert(
      unmatchedRows.map((u) => ({
        organization_id: acces.value.organization_id,
        attendance_sheet_id: input.sheetId,
        source: 'zoom_csv',
        raw_email: u.email,
        raw_name: u.name,
        join_time: u.joinTime?.toISOString() ?? null,
        leave_time: u.leaveTime?.toISOString() ?? null,
        duration_minutes: u.durationMinutes,
      })),
    );
  }

  return {
    ok: true,
    totalRows: parsed.rows.length,
    matched,
    unmatched: unmatchedRows.length,
    unmatchedPreview: unmatchedRows.slice(0, 10).map((r) => ({ email: r.email, name: r.name, durationMinutes: r.durationMinutes })),
  };
}

// ── Feuilles demi-journée ───────────────────────────────────────────────────
export type EnsureSheetsResult = { ok: true; created: number } | { ok: false; error: string };

/** Matérialise (idempotent) les feuilles matin/après-midi de la séance. */
export async function ensureSessionSheets(sessionId: string): Promise<EnsureSheetsResult> {
  const acces = await accessibleSession(sessionId);
  if (!acces.ok) return { ok: false, error: acces.error };
  const { data, error } = await supabaseAdmin()
    .schema('app')
    .rpc('materialize_attendance_slots' as never, { p_session_id: sessionId } as never);
  if (error) return { ok: false, error: error.message };
  return { ok: true, created: (data as number | null) ?? 0 };
}

export type ConvertLegacyResult = { ok: true; created: number } | { ok: false; error: string };

/**
 * Convertit une feuille « journée » VIERGE (aucune signature, non clôturée) en
 * feuilles demi-journée. Refuse dès qu'une preuve existe.
 */
export async function convertLegacyFullSheet(sessionId: string): Promise<ConvertLegacyResult> {
  const acces = await accessibleSession(sessionId);
  if (!acces.ok) return { ok: false, error: acces.error };
  const sb = supabaseAdmin();

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

  const { error: delErr } = await sb.schema('app').from('attendance_sheets').delete().eq('id', fullSheet.id);
  if (delErr) return { ok: false, error: delErr.message };

  const { data, error } = await sb.schema('app').rpc('materialize_attendance_slots' as never, { p_session_id: sessionId } as never);
  if (error) return { ok: false, error: error.message };
  return { ok: true, created: (data as number | null) ?? 0 };
}
