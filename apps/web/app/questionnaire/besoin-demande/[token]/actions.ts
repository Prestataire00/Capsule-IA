'use server';

import { createClient } from '@supabase/supabase-js';
import { env } from '@/env.mjs';
import { verifyFicheBesoinToken } from '@/shared/lib/fiche-besoin-token';
import { CHAMPS_FICHE_BESOIN, type ReponsesFicheBesoin } from '@/features/questionnaire/fiche-besoin';

/**
 * Enregistrement de la fiche besoin d'une DEMANDE, par le client lui-même.
 *
 * Écrit dans `prospects.needs_analysis` — la colonne que lit la fiche de la
 * demande. C'est ce qui manquait : le formulaire par jeton de dossier écrivait
 * dans `questionnaire_responses`, jamais dans le prospect, si bien que la
 * demande affichait « Aucune fiche besoin renseignée » alors que le client
 * avait répondu.
 *
 * Service role après vérification du jeton : le client n'est pas authentifié,
 * et l'écriture est bornée au prospect que le jeton désigne.
 */

const admin = () =>
  createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

export type EnregistrerResult = { ok: true } | { ok: false; error: string };

/** Ne garde que les champs connus, bornés : l'entrée vient du dehors. */
export function nettoyerReponses(brut: ReponsesFicheBesoin): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  for (const c of CHAMPS_FICHE_BESOIN) {
    const v = brut[c.cle];
    if (v === undefined || v === null || v === '') continue;
    if (c.type === 'rating') {
      const n = Math.round(Number(v));
      if (Number.isFinite(n) && n >= 1 && n <= 5) out[c.cle] = n;
    } else {
      out[c.cle] = String(v).trim().slice(0, 2000);
    }
  }
  return out;
}

export async function enregistrerFicheBesoinDemande(
  token: string,
  reponses: ReponsesFicheBesoin,
): Promise<EnregistrerResult> {
  const verifie = await verifyFicheBesoinToken(token);
  if (!verifie.ok) {
    return {
      ok: false,
      error: verifie.error === 'expired_token' ? 'Ce lien a expiré.' : 'Ce lien n’est pas valide.',
    };
  }

  const propres = nettoyerReponses(reponses);
  if (String(propres.objectives ?? '').trim() === '') {
    return { ok: false, error: 'Merci d’indiquer au moins vos objectifs.' };
  }

  const { error } = await admin()
    .schema('app')
    .from('prospects')
    .update({
      needs_analysis: { ...propres, rempliLe: new Date().toISOString(), rempliPar: 'client' },
      updated_at: new Date().toISOString(),
    } as never)
    .eq('id', verifie.value.prospectId)
    .eq('organization_id', verifie.value.organizationId);

  if (error) {
    console.error('[fiche besoin] réponse non enregistrée', verifie.value.prospectId, error.message);
    return { ok: false, error: 'Vos réponses n’ont pas pu être enregistrées. Réessayez dans un instant.' };
  }
  return { ok: true };
}
