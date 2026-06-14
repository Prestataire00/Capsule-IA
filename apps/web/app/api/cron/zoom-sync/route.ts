import { NextResponse, type NextRequest } from 'next/server';
import { createHash } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { env } from '@/env.mjs';
import {
  decryptZoomCredentials,
  type ZoomCredentials,
} from '@/features/attendance/zoom-secrets-cipher';
import { fetchPastMeetingParticipants, fetchMeetingRecordings } from '@/features/attendance/zoom-api-client';
import { persistSessionRecording } from '@/features/attendance/persist-session-recording';
import { computeSyncWindow } from '@/features/attendance/zoom-sync-window';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ATTENDANCE_THRESHOLD = 0.75;
const SESSION_BATCH_LIMIT = 20;

const admin = () =>
  createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

const toBuffer = (v: unknown): Buffer | null => {
  if (!v) return null;
  if (typeof v === 'string') {
    if (v.startsWith('\\x')) return Buffer.from(v.slice(2), 'hex');
    return Buffer.from(v, 'base64');
  }
  if (typeof v === 'object' && 'data' in (v as Record<string, unknown>)) {
    return Buffer.from((v as { data: number[] }).data);
  }
  return null;
};

type SessionRow = {
  id: string;
  organization_id: string;
  dossier_id: string;
  zoom_meeting_id: string;
  starts_at: string;
  ends_at: string;
};

type IntegRow = {
  config_encrypted: string | { data: number[] } | null;
  config_nonce: string | { data: number[] } | null;
  config_key_id: string | null;
};

type SyncResult = {
  sessionId: string;
  meetingId: string;
  status: 'success' | 'partial' | 'error' | 'skipped';
  matched: number;
  unmatched: number;
  errorDetail?: string;
};

const findOrCreateSheet = async (
  sb: ReturnType<typeof admin>,
  session: SessionRow,
): Promise<string | null> => {
  const { data: existing } = await sb
    .schema('app')
    .from('attendance_sheets')
    .select('id, status')
    .eq('session_id', session.id)
    .eq('half_day', 'full')
    .maybeSingle();
  if (existing) {
    const row = existing as { id: string; status: string };
    if (row.status === 'finalized') return null;
    return row.id;
  }
  const { data: created } = await sb
    .schema('app')
    .from('attendance_sheets')
    .insert({
      organization_id: session.organization_id,
      dossier_id: session.dossier_id,
      session_id: session.id,
      half_day: 'full',
      status: 'open',
    })
    .select('id')
    .single();
  return (created as { id: string } | null)?.id ?? null;
};

const loadCredentials = async (
  sb: ReturnType<typeof admin>,
  organizationId: string,
): Promise<ZoomCredentials | null> => {
  const { data } = await sb
    .schema('app')
    .from('tenant_integrations')
    .select('config_encrypted, config_nonce, config_key_id, status')
    .eq('organization_id', organizationId)
    .eq('kind', 'zoom_s2s')
    .maybeSingle();
  if (!data) return null;
  const row = data as IntegRow & { status: string };
  if (row.status !== 'active') return null;
  const cipherBuf = toBuffer(row.config_encrypted);
  const ivBuf = toBuffer(row.config_nonce);
  if (!cipherBuf || !ivBuf) return null;
  try {
    return decryptZoomCredentials({
      ciphertextWithTag: cipherBuf,
      iv: ivBuf,
      keyId: row.config_key_id,
    });
  } catch {
    return null;
  }
};

const syncSession = async (
  sb: ReturnType<typeof admin>,
  session: SessionRow,
): Promise<SyncResult> => {
  // Skip si déjà synced success
  const { count: prevSuccess } = await sb
    .schema('app')
    .from('zoom_sync_logs')
    .select('*', { head: true, count: 'exact' })
    .eq('session_id', session.id)
    .eq('status', 'success');
  if ((prevSuccess ?? 0) > 0) {
    return { sessionId: session.id, meetingId: session.zoom_meeting_id, status: 'skipped', matched: 0, unmatched: 0 };
  }

  const creds = await loadCredentials(sb, session.organization_id);
  if (!creds) {
    return {
      sessionId: session.id,
      meetingId: session.zoom_meeting_id,
      status: 'skipped',
      matched: 0,
      unmatched: 0,
      errorDetail: 'no_integration_or_decrypt_failed',
    };
  }

  const sheetId = await findOrCreateSheet(sb, session);
  if (!sheetId) {
    return {
      sessionId: session.id,
      meetingId: session.zoom_meeting_id,
      status: 'skipped',
      matched: 0,
      unmatched: 0,
      errorDetail: 'sheet_finalized',
    };
  }

  const apiResult = await fetchPastMeetingParticipants(creds, session.zoom_meeting_id);
  if (!apiResult.ok) {
    const detail = JSON.stringify(apiResult.error).slice(0, 200);
    await sb.schema('app').from('zoom_sync_logs').insert({
      organization_id: session.organization_id,
      session_id: session.id,
      attendance_sheet_id: sheetId,
      meeting_id: session.zoom_meeting_id,
      status: 'error',
      participants_count: 0,
      matched_count: 0,
      unmatched_count: 0,
      error_detail: detail,
    });
    return {
      sessionId: session.id,
      meetingId: session.zoom_meeting_id,
      status: 'error',
      matched: 0,
      unmatched: 0,
      errorDetail: detail,
    };
  }

  // Lookup learners by email
  const { data: parts } = await sb
    .schema('app')
    .from('session_participants')
    .select('learner_id, learners(email)')
    .eq('session_id', session.id)
    .eq('participant_kind', 'learner');
  const lookup = new Map<string, string>();
  for (const p of (parts ?? []) as unknown as Array<{ learner_id: string | null; learners: { email: string | null } | null }>) {
    const email = p.learners?.email?.toLowerCase().trim();
    if (email && p.learner_id) lookup.set(email, p.learner_id);
  }

  const sessionMinutes = Math.round(
    (new Date(session.ends_at).getTime() - new Date(session.starts_at).getTime()) / 60_000,
  );

  let matched = 0;
  let unmatched = 0;

  for (const row of apiResult.participants) {
    const email = row.email?.toLowerCase().trim();
    const learnerId = email ? lookup.get(email) : undefined;
    if (!learnerId) {
      unmatched++;
      await sb.schema('app').from('zoom_import_unmatched').insert({
        organization_id: session.organization_id,
        attendance_sheet_id: sheetId,
        source: 'zoom_api',
        raw_email: row.email,
        raw_name: row.name,
        join_time: row.joinTime?.toISOString() ?? null,
        leave_time: row.leaveTime?.toISOString() ?? null,
        duration_minutes: row.durationMinutes,
      });
      continue;
    }
    const statusComputed: 'present' | 'late' =
      row.durationMinutes >= ATTENDANCE_THRESHOLD * sessionMinutes ? 'present' : 'late';
    const hash = createHash('sha256').update(JSON.stringify(row.raw)).digest('hex');
    const { error } = await sb.rpc('record_zoom_attendance' as never, {
      p_attendance_sheet_id: sheetId,
      p_learner_id: learnerId,
      p_status: statusComputed,
      p_signature_hash: hash,
      p_evidence_source: 'zoom_api',
      p_evidence_payload: {
        joinTime: row.joinTime?.toISOString() ?? null,
        leaveTime: row.leaveTime?.toISOString() ?? null,
        durationMinutes: row.durationMinutes,
        statusComputed,
        raw: row.raw,
      },
    } as never);
    if (!error) matched++;
  }

  const finalStatus: 'success' | 'partial' = unmatched > 0 ? 'partial' : 'success';
  await sb.schema('app').from('zoom_sync_logs').insert({
    organization_id: session.organization_id,
    session_id: session.id,
    attendance_sheet_id: sheetId,
    meeting_id: session.zoom_meeting_id,
    status: finalStatus,
    participants_count: apiResult.participants.length,
    matched_count: matched,
    unmatched_count: unmatched,
  });

  // Best-effort : récupère les enregistrements Zoom sans bloquer la sync présences.
  try {
    const recResult = await fetchMeetingRecordings(creds, session.zoom_meeting_id);
    if (recResult.ok) {
      for (const recording of recResult.recordings) {
        const r = await persistSessionRecording(sb, {
          organizationId: session.organization_id,
          sessionId: session.id,
          recording,
        });
        if (!r.ok) {
          console.warn(`[zoom-sync] persistSessionRecording failed for session ${session.id}:`, r.error);
        }
      }
    } else {
      console.warn(`[zoom-sync] fetchMeetingRecordings failed for session ${session.id}:`, recResult.error.code);
    }
  } catch (recErr) {
    console.warn(`[zoom-sync] unexpected error fetching recordings for session ${session.id}:`, recErr);
  }

  return {
    sessionId: session.id,
    meetingId: session.zoom_meeting_id,
    status: finalStatus,
    matched,
    unmatched,
  };
};

const authorized = (req: NextRequest): boolean => {
  const header = req.headers.get('authorization');
  if (!header) return false;
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : header.trim();
  return token === env.CRON_SECRET;
};

export async function POST(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }
  if (!env.ZOOM_SECRETS_KEY) {
    return NextResponse.json({ ok: false, error: 'zoom_secrets_key_missing' }, { status: 503 });
  }

  const sb = admin();
  const { floorIso, cutoffIso } = computeSyncWindow(new Date());

  const { data: sessions, error } = await sb
    .schema('app')
    .from('sessions')
    .select('id, organization_id, dossier_id, zoom_meeting_id, starts_at, ends_at')
    .eq('modality', 'distanciel')
    .not('zoom_meeting_id', 'is', null)
    .gte('ends_at', floorIso)   // borne basse = rétention Zoom
    .lt('ends_at', cutoffIso)   // borne haute = délai de stabilisation
    .order('ends_at', { ascending: true }) // traiter d'abord les plus proches de l'expiration
    .limit(SESSION_BATCH_LIMIT);
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const results: SyncResult[] = [];
  for (const session of (sessions ?? []) as unknown as SessionRow[]) {
    if (!session.zoom_meeting_id) continue;
    const r = await syncSession(sb, session);
    results.push(r);
  }

  return NextResponse.json({
    ok: true,
    processed: results.length,
    summary: {
      success: results.filter((r) => r.status === 'success').length,
      partial: results.filter((r) => r.status === 'partial').length,
      error: results.filter((r) => r.status === 'error').length,
      skipped: results.filter((r) => r.status === 'skipped').length,
    },
    results,
  });
}

export async function GET(req: NextRequest) {
  // Permettre GET pour les cron managers qui ne supportent que GET
  return POST(req);
}
