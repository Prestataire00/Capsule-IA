'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { createClient } from '@supabase/supabase-js';
import { env } from '@/env.mjs';
import { guardAction } from '@/shared/lib/auth/guard-action';
import { ecrireSousLOrganisme, type EcrireResult } from '@/features/emails/ecrire-sous-organisme';

/**
 * Écrire au client depuis le dossier, sous l'adresse de l'organisme.
 *
 * Le bouton ouvrait `mailto:` — donc la messagerie personnelle de celui qui
 * clique. Trois conséquences, toutes silencieuses : le client recevait un
 * message de « prenom.nom@gmail.com » au lieu de l'organisme, l'échange
 * n'apparaissait nulle part dans le CRM, et une réponse partait dans une boîte
 * que personne d'autre ne relit. Un dossier suivi à trois n'a pas de
 * correspondance privée.
 *
 * L'envoi passe donc par le même canal que les convocations et les
 * conventions, et se journalise dans `email_log` — c'est ce qui alimente
 * l'historique des e-mails du dossier.
 */

const admin = () =>
  createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

export type { EcrireResult };

const Schema = z.object({
  destinataire: z.string().trim().email('Adresse du destinataire invalide.'),
  objet: z.string().trim().min(1, 'Indiquez un objet.').max(200),
  message: z.string().trim().min(1, 'Écrivez votre message.').max(5000),
});

/** Liée au dossier par la page (`ecrireAuClient.bind(null, id)`). */
export async function ecrireAuClient(dossierId: string, brut: z.input<typeof Schema>): Promise<EcrireResult> {
  // `crm` et non `dossiers` : écrire au client est un geste de relation, et
  // c'est la section que porte déjà la fiche demande.
  const garde = await guardAction('crm');
  if (!garde.ok) return { ok: false, error: garde.error };
  const p = Schema.safeParse(brut);
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? 'Saisie invalide.' };
  if (!z.string().uuid().safeParse(dossierId).success) return { ok: false, error: 'Dossier introuvable.' };

  const sb = admin();
  const { data: dossier } = await sb
    .schema('app')
    .from('dossiers')
    .select('id, reference')
    .eq('id', dossierId)
    .eq('organization_id', garde.member.organizationId)
    .is('deleted_at', null)
    .maybeSingle();
  if (!dossier) return { ok: false, error: 'Dossier introuvable.' };

  const r = await ecrireSousLOrganisme(sb, {
    organizationId: garde.member.organizationId,
    userId: garde.member.userId,
    destinataire: p.data.destinataire,
    objet: p.data.objet,
    message: p.data.message,
    dossierId: dossierId,
  });
  if (r.ok) revalidatePath(`/dossiers/${dossierId}`);
  return r;
}
