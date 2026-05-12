'use server';

import { createClient } from '@supabase/supabase-js';
import { env } from '@/env.mjs';
import { generateSignatureToken } from '@/shared/lib/signature-token';

const admin = () =>
  createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

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
