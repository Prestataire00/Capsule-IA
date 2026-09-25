'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { createClient } from '@supabase/supabase-js';
import { env } from '@/env.mjs';
import { guardAction } from '@/shared/lib/auth/guard-action';
import { parseEurosToCents } from '@/features/billing/domain/quote';

/**
 * Le montant d'un dossier, modifiable depuis sa fiche.
 *
 * Il se posait à la création — repris de la demande ou du tarif catalogue — et
 * ne bougeait plus : une remise négociée, un stagiaire de plus ou de moins, un
 * devis revu obligeaient à reprendre le dossier par la base. Or c'est ce
 * montant qui commande le reste à payer, le devis et la facture.
 *
 * Garde sur la FACTURATION et non sur les dossiers : le formateur désigné gère
 * l'affaire depuis son espace — apprenants, séances, émargement — mais pas les
 * tarifs, comme le dit la fiche. Propriétaire, administrateur, gestionnaire et
 * comptable y ont droit.
 */

const admin = () =>
  createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

export type MontantResult = { ok: true } | { ok: false; error: string };

const Schema = z.object({
  dossierId: z.string().uuid(),
  /** Saisi comme on l'écrit : « 4000 », « 4 000,50 ». Vide = montant à définir. */
  montant: z.string().trim().max(20),
});

export async function modifierMontantDossier(brut: z.input<typeof Schema>): Promise<MontantResult> {
  const garde = await guardAction('billing');
  if (!garde.ok) return { ok: false, error: garde.error };
  const p = Schema.safeParse(brut);
  if (!p.success) return { ok: false, error: 'Saisie invalide.' };

  // Vide efface le montant plutôt que d'écrire zéro : « à définir » et
  // « gratuit » ne se ressemblent pas sur un devis.
  let cents: number | null = null;
  if (p.data.montant !== '') {
    cents = parseEurosToCents(p.data.montant);
    if (cents === null || cents < 0) {
      return { ok: false, error: 'Montant invalide — écrivez par exemple 4000 ou 4 000,50.' };
    }
  }

  const sb = admin();
  const { data: existant } = await sb
    .schema('app')
    .from('dossiers')
    .select('id')
    .eq('id', p.data.dossierId)
    .eq('organization_id', garde.member.organizationId)
    .is('deleted_at', null)
    .maybeSingle();
  if (!existant) return { ok: false, error: 'Dossier introuvable.' };

  const { error } = await sb
    .schema('app')
    .from('dossiers')
    .update({ total_amount_cents: cents, updated_at: new Date().toISOString() } as never)
    .eq('id', p.data.dossierId);
  if (error) {
    console.error('[dossier] montant non enregistré', p.data.dossierId, error.message);
    return { ok: false, error: 'Le montant n’a pas pu être enregistré.' };
  }

  // Le reste à payer se calcule à partir de ce montant : les deux écrans qui
  // l'affichent doivent le relire, sans quoi ils annonceraient deux chiffres
  // différents sur la même affaire.
  revalidatePath(`/dossiers/${p.data.dossierId}`, 'layout');
  revalidatePath(`/dossiers/${p.data.dossierId}/financeurs`);
  revalidatePath('/dossiers');
  return { ok: true };
}
