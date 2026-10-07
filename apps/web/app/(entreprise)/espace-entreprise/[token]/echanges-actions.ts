'use server';

import { revalidatePath } from 'next/cache';
import { verifyEntrepriseToken } from '@/shared/lib/entreprise-token';
import { messageEntrepriseSchema } from '@/features/espace-entreprise/message.schema';
import { ecrireDepuisLEspace } from '@/features/espace-entreprise/ecrire-depuis-l-espace';

/** Le référent écrit à l'organisme depuis son espace. Son lien est sa seule preuve. */
export async function envoyerMessageEntreprise(
  token: string,
  input: { body: string; interlocuteur?: string | null },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const p = messageEntrepriseSchema.safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? 'Message invalide.' };
  const lien = await verifyEntrepriseToken(token);
  if (!lien.ok) return { ok: false, error: 'Ce lien n’est plus valable. Demandez-en un nouveau à votre organisme.' };
  const r = await ecrireDepuisLEspace({ ...lien.value, body: p.data.body, interlocuteur: p.data.interlocuteur ?? null });
  if (r.ok) revalidatePath(`/espace-entreprise/${token}`);
  return r;
}
