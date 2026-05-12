'use server';

import { createHash } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { env } from '@/env.mjs';
import { generateSignatureToken } from '@/shared/lib/signature-token';
import { parseZoomCsv } from '@/features/attendance/zoom-csv-parser';

const admin = () =>
  createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

const ATTENDANCE_THRESHOLD = 0.75;

export type GenerateParticipantLinkResult =
  | { ok: true; url: string; expiresAt: string }
  | { ok: false; error: string };

export async function ensureAttendanceSheet(input: {
  sessionId: string;
  organizationId: string;
  dossierId: string;
}): Promise<{ ok: true; sheetId: string } | { ok: false; error: string }> {
  const sb = admin();

  const { data: existing } = await sb
    .schema('app')
    .from('attendance_sheets')
    .select('id')
    .eq('session_id', input.sessionId)
    .eq('half_day', 'full')
    .maybeSingle();

  if (existing) {
    return { ok: true, sheetId: (existing as { id: string }).id };
  }

  const { data: created, error } = await sb
    .schema('app')
    .from('attendance_sheets')
    .insert({
      organization_id: input.organizationId,
      dossier_id: input.dossierId,
      session_id: input.sessionId,
      half_day: 'full',
      status: 'open',
    })
    .select('id')
    .single();

  if (error || !created) return { ok: false, error: error?.message ?? 'create_failed' };
  return { ok: true, sheetId: (created as { id: string }).id };
}

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

export async function finalizeAttendanceSheet(input: { sheetId: string }): Promise<{ ok: true } | { ok: false; error: string }> {
  const sb = admin();
  const { error } = await sb
    .schema('app')
    .from('attendance_sheets')
    .update({ status: 'finalized', finalized_at: new Date().toISOString() })
    .eq('id', input.sheetId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
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

    const { error } = await sb.rpc('record_attendance_signature' as never, {
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
    if (!error) matched++;
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
