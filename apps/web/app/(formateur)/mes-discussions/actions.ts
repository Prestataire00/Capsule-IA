'use server';

import { revalidatePath } from 'next/cache';
import { accesFormateur } from '@/features/discussions/acces';
import { messageEquipeSchema, type MessageEquipeInput } from '@/features/discussions/discussion.schema';
import { publierMessageEquipe, type ResultatEnvoi } from '@/features/discussions/store';

export async function envoyerMessageFormateur(input: MessageEquipeInput): Promise<ResultatEnvoi> {
  const p = messageEquipeSchema.safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? 'Message invalide.' };
  const acces = await accesFormateur(p.data.dossierId);
  if (!acces.ok) return { ok: false, error: 'Ce dossier ne vous est pas confié.' };
  const r = await publierMessageEquipe({
    organizationId: acces.organizationId,
    dossierId: p.data.dossierId,
    authorUserId: acces.userId,
    authorName: acces.nom,
    body: p.data.body,
  });
  if (r.ok) {
    revalidatePath('/mes-discussions');
    revalidatePath('/messagerie');
  }
  return r;
}
