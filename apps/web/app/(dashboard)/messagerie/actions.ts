'use server';

import { revalidatePath } from 'next/cache';
import { contactDeLOrganisme } from '@/features/espace-entreprise/messages-store';
import { repondreAuContact } from '@/features/espace-entreprise/repondre-au-client';
import { accesEquipe } from '@/features/discussions/acces';
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

export async function envoyerMessageEquipe(input: MessageEquipeInput): Promise<ResultatEnvoi> {
  const p = messageEquipeSchema.safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? 'Message invalide.' };
  const acces = await accesEquipe(p.data.dossierId);
  if (!acces.ok) return { ok: false, error: 'Ce dossier ne vous est pas accessible.' };
  const r = await publierMessageEquipe({
    organizationId: acces.organizationId,
    dossierId: p.data.dossierId,
    authorUserId: acces.userId,
    authorName: acces.nom,
    body: p.data.body,
  });
  if (r.ok) {
    revalidatePath('/messagerie');
    revalidatePath('/mes-discussions');
  }
  return r;
}

export async function ouvrirConversationEquipe(
  input: NouvelleConversationInput,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const p = nouvelleConversationSchema.safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? 'Choix invalide.' };
  const moi = await accesEquipe(null);
  if (!moi.ok) return { ok: false, error: 'La messagerie ne vous est pas accessible.' };
  const joignables = await interlocuteursDe(moi.organizationId, { avecFormateurs: true });
  return ouvrirConversation({
    organizationId: moi.organizationId,
    auteurId: moi.userId,
    avec: p.data.avec,
    joignables: joignables.map((j) => j.userId),
  });
}

export async function envoyerMessageDirectEquipe(input: MessageDirectInput): Promise<ResultatEnvoi> {
  const p = messageDirectSchema.safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? 'Message invalide.' };
  const moi = await accesEquipe(null);
  if (!moi.ok) return { ok: false, error: 'La messagerie ne vous est pas accessible.' };
  const acces = await accesConversation(p.data.conversationId, moi.userId);
  if (!acces.ok || acces.organizationId !== moi.organizationId) return { ok: false, error: 'Cette conversation ne vous est pas accessible.' };
  const r = await publierMessageDirect({
    conversationId: p.data.conversationId,
    organizationId: acces.organizationId,
    auteurId: moi.userId,
    auteurNom: moi.nom,
    body: p.data.body,
    cheminDe: await cheminsDesMessageries(acces.organizationId),
  });
  if (r.ok) {
    revalidatePath('/messagerie');
    revalidatePath('/mes-discussions');
  }
  return r;
}

/** Répondre au référent d'un client depuis la messagerie : le fil de son espace entreprise. */
export async function repondreAuClient(interlocuteur: string | null, input: MessageDirectInput): Promise<ResultatEnvoi> {
  const p = messageDirectSchema.safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? 'Message invalide.' };
  const moi = await accesEquipe(null);
  if (!moi.ok) return { ok: false, error: 'La messagerie ne vous est pas accessible.' };
  if (!(await contactDeLOrganisme(moi.organizationId, p.data.conversationId))) return { ok: false, error: 'Ce client ne vous est pas accessible.' };
  // Un fil direct ne se répond que par son destinataire.
  if (interlocuteur && interlocuteur !== moi.userId) return { ok: false, error: 'Ce fil est adressé à un collègue.' };
  const r = await repondreAuContact({
    organizationId: moi.organizationId,
    contactId: p.data.conversationId,
    dossierId: null,
    auteurNom: moi.nom,
    auteurUserId: moi.userId,
    interlocuteurUserId: interlocuteur,
    body: p.data.body,
  });
  if (r.ok) revalidatePath('/messagerie');
  return r;
}
