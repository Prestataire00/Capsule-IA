'use server';

import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { createClient } from '@supabase/supabase-js';
import { env } from '@/env.mjs';
import { createMeetEvent } from '@/shared/lib/integrations/google-calendar-client';
import { loadGoogleCredsForUser } from '@/shared/lib/integrations/google-calendar-store';
import { supabaseServer } from '@/shared/lib/supabase/server';

const admin = () =>
  createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

const REMOTE = new Set(['distanciel', 'hybride']);

type Input = {
  formationId: string;
  title: string;
  modality: string;
  startsAt: string; // ISO
  endsAt: string; // ISO
  location?: string;
};

type Result = { ok: true; sessionId: string } | { ok: false; error: string };

async function currentUserId(): Promise<string | null> {
  const { data } = await supabaseServer().auth.getUser();
  return data?.user?.id ?? null;
}

const one = (v: unknown) => (Array.isArray(v) ? v[0] : v);

/**
 * Crée une session de GROUPE rattachée à une formation (sans dossier propriétaire).
 * Lie tous les dossiers actifs de la formation dans session_dossiers (participants
 * dérivés automatiquement), et crée un Meet de groupe si distanciel.
 */
export async function createFormationSession(input: Input): Promise<Result> {
  if (!input.title.trim()) return { ok: false, error: 'Intitulé requis' };
  if (!input.startsAt || !input.endsAt) return { ok: false, error: 'Dates requises' };
  if (new Date(input.endsAt) <= new Date(input.startsAt)) return { ok: false, error: 'Fin avant début' };

  const sb = admin();
  const { data: fRow } = await sb
    .schema('app')
    .from('formations')
    .select('organization_id, title')
    .eq('id', input.formationId)
    .maybeSingle();
  if (!fRow) return { ok: false, error: 'Formation introuvable' };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const f = fRow as any;
  const org = f.organization_id as string;

  const sessionId = randomUUID();
  const { error: insErr } = await sb.schema('app').from('sessions').insert({
    id: sessionId,
    organization_id: org,
    dossier_id: null,
    formation_id: input.formationId,
    title: input.title.trim(),
    modality: input.modality,
    status: 'planned',
    starts_at: input.startsAt,
    ends_at: input.endsAt,
    location: input.location?.trim() || null,
  } as never);
  if (insErr) return { ok: false, error: insErr.message };

  // Lier tous les dossiers non supprimés de la formation → participants dérivés.
  const { data: dRows } = await sb
    .schema('app')
    .from('dossiers')
    .select('id, learner:learners(email)')
    .eq('formation_id', input.formationId)
    .is('deleted_at', null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const dossiers = ((dRows as any[]) ?? []);

  if (dossiers.length > 0) {
    await sb.schema('app').from('session_dossiers').upsert(
      dossiers.map((d) => ({ session_id: sessionId, dossier_id: d.id, organization_id: org })),
      { onConflict: 'session_id,dossier_id' },
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (sb as any).rpc('materialize_session_participants', { p_session_id: sessionId });
  }

  // Meet de groupe (best-effort) si distanciel/hybride et agenda Google connecté.
  if (REMOTE.has(input.modality)) {
    const userId = await currentUserId();
    const creds = userId ? await loadGoogleCredsForUser(sb, userId) : null;
    if (creds) {
      const emails = dossiers
        .map((d) => (one(d.learner) as { email?: string } | null)?.email)
        .filter((e): e is string => !!e);
      const res = await createMeetEvent(creds, {
        title: input.title.trim(),
        startsAt: input.startsAt,
        endsAt: input.endsAt,
        attendeeEmails: emails,
        description: `${f.title} · session de groupe`,
      });
      if (res.ok) {
        await sb
          .schema('app')
          .from('sessions')
          .update({
            remote_url: res.value.meetUrl,
            zoom_metadata: { provider: 'google_meet', calendar_event_id: res.value.eventId },
          } as never)
          .eq('id', sessionId);
      }
    }
  }

  revalidatePath(`/formations/${input.formationId}`);
  revalidatePath('/sessions');
  return { ok: true, sessionId };
}
