'use server';

import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import { createClient } from '@supabase/supabase-js';
import { env } from '@/env.mjs';
import { guardAction } from '@/shared/lib/auth/guard-action';
import { sendEmail } from '@/shared/lib/email/resend';
import { generateFicheBesoinUrl } from '@/shared/lib/fiche-besoin-token';
import { resolvePublicOrigin } from '@/shared/lib/http/public-origin';
import { type ReponsesFicheBesoin } from '@/features/questionnaire/fiche-besoin';
import { nettoyerReponses } from '@/app/questionnaire/besoin-demande/[token]/actions';

/**
 * Fiche besoin d'une demande : l'envoyer au client, ou la remplir soi-même.
 *
 * Elle ne partait jusqu'ici qu'automatiquement, à la création d'un dossier —
 * donc trop tard, et sans aucun geste possible pour relancer. Or l'analyse du
 * besoin précède la décision : c'est elle qui dit quelle formation vendre.
 */

const admin = () =>
  createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

export type FicheBesoinResult = { ok: true; message: string } | { ok: false; error: string };

async function chargerDemande(prospectId: string, organizationId: string) {
  const { data } = await admin()
    .schema('app')
    .from('prospects')
    .select('id, first_name, last_name, email, organization_id')
    .eq('id', prospectId)
    .eq('organization_id', organizationId)
    .maybeSingle();
  return data as { id: string; first_name: string; last_name: string; email: string | null } | null;
}

export async function envoyerFicheBesoinDemande(prospectId: string): Promise<FicheBesoinResult> {
  const garde = await guardAction('crm');
  if (!garde.ok) return { ok: false, error: garde.error };

  const demande = await chargerDemande(prospectId, garde.member.organizationId);
  if (!demande) return { ok: false, error: 'Demande introuvable.' };
  if (!demande.email) return { ok: false, error: 'Cette demande n’a pas d’adresse e-mail.' };

  // Jamais de repli sur localhost : ce lien part chez un client.
  const base = resolvePublicOrigin(env.PUBLIC_APP_URL, headers(), '');
  if (!base || base.includes('localhost')) {
    return { ok: false, error: 'Adresse publique de l’application non configurée (PUBLIC_APP_URL).' };
  }

  const url = await generateFicheBesoinUrl(
    { prospectId: demande.id, organizationId: garde.member.organizationId },
    base,
  );

  const { data: orgRow } = await admin()
    .schema('app')
    .from('organizations')
    .select('name')
    .eq('id', garde.member.organizationId)
    .maybeSingle();
  const orgName = (orgRow as { name: string } | null)?.name ?? 'Votre organisme de formation';

  const r = await sendEmail({
    to: demande.email,
    subject: 'Quelques questions pour préparer votre formation',
    html: `<p>Bonjour ${demande.first_name ?? ''},</p>
<p>Afin d'adapter la formation à votre situation, merci de répondre à ces quelques questions :</p>
<p><a href="${url}" style="display:inline-block;background:#f97316;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:600">Répondre à la fiche besoin</a></p>
<p style="color:#64748b;font-size:13px">Ce lien vous est personnel. Il reste valable 60 jours.</p>
<p>${orgName}</p>`,
    organizationId: garde.member.organizationId,
    kind: 'fiche_besoin_demande',
    // Relancer est un geste délibéré : pas de clé d'unicité, sans quoi la
    // deuxième demande de l'organisme resterait sans effet.
  });

  if (!r.ok) {
    if (r.reason === 'no_api_key') return { ok: false, error: 'Aucun service d’envoi configuré.' };
    return { ok: false, error: 'L’e-mail n’a pas pu être envoyé.' };
  }

  revalidatePath(`/prospects/${prospectId}`);
  return { ok: true, message: `Fiche besoin envoyée à ${demande.email}.` };
}

export async function saisirFicheBesoinDemande(
  prospectId: string,
  reponses: ReponsesFicheBesoin,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const garde = await guardAction('crm');
  if (!garde.ok) return { ok: false, error: garde.error };

  const propres = nettoyerReponses(reponses);
  if (String(propres.objectives ?? '').trim() === '') {
    return { ok: false, error: 'Indiquez au moins les objectifs.' };
  }

  const { error } = await admin()
    .schema('app')
    .from('prospects')
    .update({
      // `rempliPar` distingue ce que le client a dit de ce que nous avons noté
      // pour lui : en audit, ce n'est pas la même preuve.
      needs_analysis: {
        ...propres,
        rempliLe: new Date().toISOString(),
        rempliPar: 'organisme',
        rempliParUserId: garde.member.userId,
      },
      updated_at: new Date().toISOString(),
    } as never)
    .eq('id', prospectId)
    .eq('organization_id', garde.member.organizationId);

  if (error) {
    console.error('[fiche besoin] saisie impossible', prospectId, error.message);
    return { ok: false, error: 'La saisie n’a pas pu être enregistrée.' };
  }

  revalidatePath(`/prospects/${prospectId}`);
  return { ok: true };
}
