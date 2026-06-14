'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createClient } from '@supabase/supabase-js';
import { authActionClient } from '@/shared/lib/safe-action';
import { supabaseServer } from '@/shared/lib/supabase/server';
import { env } from '@/env.mjs';
import {
  decryptZoomCredentials,
} from '@/features/attendance/zoom-secrets-cipher';
import { fetchMeetingRecordings } from '@/features/attendance/zoom-api-client';
import { persistSessionRecording } from '@/features/attendance/persist-session-recording';

// ─── helpers ────────────────────────────────────────────────────────────────

const adminClient = () =>
  createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

/** Résout l'organization_id du membre connecté (via RLS memberships). */
async function resolveOrgId(userId: string): Promise<string | null> {
  const sb = supabaseServer();
  const { data } = await sb
    .schema('app')
    .from('memberships')
    .select('organization_id')
    .eq('user_id', userId)
    .maybeSingle();
  return (data as { organization_id: string } | null)?.organization_id ?? null;
}

type IntegRow = {
  config_encrypted: string | { data: number[] } | null;
  config_nonce: string | { data: number[] } | null;
  config_key_id: string | null;
};

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

// ─── fetchSessionRecording ──────────────────────────────────────────────────

export const fetchSessionRecording = authActionClient
  .schema(z.object({ sessionId: z.string().uuid(), dossierId: z.string().uuid() }))
  .action(async ({ parsedInput, ctx }) => {
    if (!env.ZOOM_SECRETS_KEY) throw new Error('zoom_secrets_key_missing');

    const orgId = await resolveOrgId(ctx.userId as string);
    if (!orgId) throw new Error('Organisation introuvable');

    // Lecture session via service_role pour accéder à zoom_meeting_id sans contrainte RLS
    const sb = adminClient();

    const { data: sessionRaw } = await sb
      .schema('app')
      .from('sessions')
      .select('id, organization_id, zoom_meeting_id')
      .eq('id', parsedInput.sessionId)
      .eq('organization_id', orgId)
      .maybeSingle();

    const session = sessionRaw as {
      id: string;
      organization_id: string;
      zoom_meeting_id: string | null;
    } | null;

    if (!session) throw new Error('Session introuvable');
    if (!session.zoom_meeting_id) throw new Error('Pas de réunion Zoom associée à cette session');

    // Déchiffrement des creds Zoom (même pattern que le cron)
    const { data: integRaw } = await sb
      .schema('app')
      .from('tenant_integrations')
      .select('config_encrypted, config_nonce, config_key_id, status')
      .eq('organization_id', orgId)
      .eq('kind', 'zoom_s2s')
      .maybeSingle();

    if (!integRaw) throw new Error('Intégration Zoom non configurée');
    const integ = integRaw as IntegRow & { status: string };
    if (integ.status !== 'active') throw new Error('Intégration Zoom inactive');

    const cipherBuf = toBuffer(integ.config_encrypted);
    const ivBuf = toBuffer(integ.config_nonce);
    if (!cipherBuf || !ivBuf) throw new Error('Format des credentials Zoom invalide');

    const creds = decryptZoomCredentials({
      ciphertextWithTag: cipherBuf,
      iv: ivBuf,
      keyId: integ.config_key_id,
    });

    const recResult = await fetchMeetingRecordings(creds, session.zoom_meeting_id);
    if (!recResult.ok) throw new Error(`Zoom API: ${recResult.error.code}`);

    let count = 0;
    for (const recording of recResult.recordings) {
      const r = await persistSessionRecording(sb, {
        organizationId: orgId,
        sessionId: parsedInput.sessionId,
        recording,
        createdBy: ctx.userId as string,
      });
      if (r.ok) count++;
    }

    revalidatePath(`/dossiers/${parsedInput.dossierId}/sessions`);
    return { ok: true, count };
  });

// ─── toggleRecordingPublish ─────────────────────────────────────────────────

export const toggleRecordingPublish = authActionClient
  .schema(z.object({ recordingId: z.string().uuid(), isPublished: z.boolean() }))
  .action(async ({ parsedInput, ctx }) => {
    const { error } = await ctx.supabase
      .schema('app')
      .from('session_recordings' as never)
      .update({ is_published: parsedInput.isPublished } as never)
      .eq('id', parsedInput.recordingId);

    if (error) throw new Error(error.message);
    return { ok: true };
  });
