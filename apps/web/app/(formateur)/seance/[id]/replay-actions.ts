'use server';

import type { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { requireMyTrainerSession } from '@/features/trainer-space/guard';
import { enregistrerReplay, retirerReplay, type ResultatReplay } from '@/features/sessions/replays-store';
import { replaySchema } from '@/features/sessions/replays.schema';

/** Le formateur ajoute le replay (tl;dv, Lexi…) de SA séance. */
export async function ajouterReplayFormateur(brut: z.input<typeof replaySchema>): Promise<ResultatReplay> {
  const p = replaySchema.safeParse(brut);
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? 'Lien invalide.' };
  const acces = await requireMyTrainerSession(p.data.sessionId);
  if (!acces.ok) return { ok: false, error: 'Séance introuvable.' };
  const r = await enregistrerReplay({
    organizationId: acces.session.organization_id,
    sessionId: p.data.sessionId,
    url: p.data.url,
    titre: p.data.titre ?? null,
    userId: acces.userId,
  });
  if (r.ok) revalidatePath(`/seance/${p.data.sessionId}`);
  return r;
}

export async function retirerReplayFormateur(sessionId: string, replayId: string): Promise<ResultatReplay> {
  const acces = await requireMyTrainerSession(sessionId);
  if (!acces.ok) return { ok: false, error: 'Séance introuvable.' };
  const r = await retirerReplay({ organizationId: acces.session.organization_id, sessionId, replayId });
  if (r.ok) revalidatePath(`/seance/${sessionId}`);
  return r;
}
