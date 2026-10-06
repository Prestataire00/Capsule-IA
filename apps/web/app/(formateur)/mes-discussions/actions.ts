'use server';

import { revalidatePath } from 'next/cache';
import { accesFormateur, moiFormateur } from '@/features/discussions/acces';
import {
  messageDirectSchema,
  messageEquipeSchema,
  nouvelleConversationSchema,
  type MessageDirectInput,
  type MessageEquipeInput,
  type NouvelleConversationInput,
} from '@/features/discussions/discussion.schema';
import {
  accesConversation,
  cheminsDesMessageries,
  interlocuteursDe,
  ouvrirConversation,
  publierMessageDirect,
} from '@/features/discussions/directs-store';
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

/** L'organisme où toutes les personnes choisies font partie de l'équipe. */
async function organismeCommun(organizationIds: readonly string[], avec: readonly string[]) {
  for (const org of organizationIds) {
    const equipe = await interlocuteursDe(org, { avecFormateurs: false });
    const ids = equipe.map((e) => e.userId);
    if (avec.every((a) => ids.includes(a))) return { org, ids };
  }
  return null;
}

export async function ouvrirConversationFormateur(
  input: NouvelleConversationInput,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const p = nouvelleConversationSchema.safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? 'Choix invalide.' };
  const moi = await moiFormateur();
  if (!moi.ok) return { ok: false, error: 'Votre espace formateur n’est pas accessible.' };
  const commun = await organismeCommun(moi.organizationIds, p.data.avec);
  if (!commun) return { ok: false, error: 'Choisissez des personnes d’un même organisme.' };
  return ouvrirConversation({ organizationId: commun.org, auteurId: moi.userId, avec: p.data.avec, joignables: commun.ids });
}

export async function envoyerMessageDirectFormateur(input: MessageDirectInput): Promise<ResultatEnvoi> {
  const p = messageDirectSchema.safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? 'Message invalide.' };
  const moi = await moiFormateur();
  if (!moi.ok) return { ok: false, error: 'Votre espace formateur n’est pas accessible.' };
  const acces = await accesConversation(p.data.conversationId, moi.userId);
  if (!acces.ok || !moi.organizationIds.includes(acces.organizationId)) {
    return { ok: false, error: 'Cette conversation ne vous est pas accessible.' };
  }
  const r = await publierMessageDirect({
    conversationId: p.data.conversationId,
    organizationId: acces.organizationId,
    auteurId: moi.userId,
    auteurNom: moi.nom,
    body: p.data.body,
    cheminDe: await cheminsDesMessageries(acces.organizationId),
  });
  if (r.ok) {
    revalidatePath('/mes-discussions');
    revalidatePath('/messagerie');
  }
  return r;
}
