'use server';

import type { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { guardAction } from '@/shared/lib/auth/guard-action';
import { supabaseAdmin } from '@/shared/lib/supabase/admin';
import { enregistrerReplay, retirerReplay, type ResultatReplay } from '@/features/sessions/replays-store';
import { replaySchema } from '@/features/sessions/replays.schema';

/** L'équipe ajoute ou retire le replay d'une séance de son organisme. */
async function seanceDeLOrganisme(sessionId: string): Promise<{ organizationId: string; userId: string } | null> {
  const garde = await guardAction('dossiers');
  if (!garde.ok) return null;
  const { data } = await supabaseAdmin().schema('app').from('sessions').select('organization_id').eq('id', sessionId).maybeSingle();
  if ((data as { organization_id: string } | null)?.organization_id !== garde.member.organizationId) return null;
  return { organizationId: garde.member.organizationId, userId: garde.member.userId };
}

export async function ajouterReplaySeance(brut: z.input<typeof replaySchema>): Promise<ResultatReplay> {
  const p = replaySchema.safeParse(brut);
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? 'Lien invalide.' };
  const g = await seanceDeLOrganisme(p.data.sessionId);
  if (!g) return { ok: false, error: 'Séance introuvable.' };
  const r = await enregistrerReplay({ organizationId: g.organizationId, sessionId: p.data.sessionId, url: p.data.url, titre: p.data.titre ?? null, userId: g.userId });
  if (r.ok) revalidatePath(`/sessions/${p.data.sessionId}`);
  return r;
}

export async function retirerReplaySeance(sessionId: string, replayId: string): Promise<ResultatReplay> {
  const g = await seanceDeLOrganisme(sessionId);
  if (!g) return { ok: false, error: 'Séance introuvable.' };
  const r = await retirerReplay({ organizationId: g.organizationId, sessionId, replayId });
  if (r.ok) revalidatePath(`/sessions/${sessionId}`);
  return r;
}
