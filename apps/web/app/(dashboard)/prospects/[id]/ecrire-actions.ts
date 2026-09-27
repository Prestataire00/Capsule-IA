'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import type { SupabaseClient } from '@supabase/supabase-js';
import { guardAction } from '@/shared/lib/auth/guard-action';
import { supabaseAdmin } from '@/shared/lib/supabase/admin';
import { ecrireSousLOrganisme, type EcrireResult } from '@/features/emails/ecrire-sous-organisme';

/**
 * Écrire à la personne depuis sa fiche demande, sous l'adresse de l'organisme.
 *
 * « Relancer par e-mail » ouvrait la messagerie personnelle : rien de l'échange
 * ne restait sur la fiche. L'e-mail part désormais de l'organisme, et son
 * contenu s'inscrit dans « Suivi & historique » — ce qui a été écrit, quand,
 * par qui — pour que celui qui reprend la demande sache où on en est.
 */

const Schema = z.object({
  destinataire: z.string().trim().email('Adresse du destinataire invalide.'),
  objet: z.string().trim().min(1, 'Indiquez un objet.').max(200),
  message: z.string().trim().min(1, 'Écrivez votre message.').max(5000),
});

/** Liée à la demande par la page (`ecrireALaDemande.bind(null, id)`). */
export async function ecrireALaDemande(prospectId: string, brut: z.input<typeof Schema>): Promise<EcrireResult> {
  const garde = await guardAction('crm', 'read');
  if (!garde.ok) return { ok: false, error: garde.error === 'forbidden' ? 'Votre rôle ne permet pas d’écrire aux clients.' : 'Session expirée — reconnectez-vous.' };
  const p = Schema.safeParse(brut);
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? 'Saisie invalide.' };
  if (!z.string().uuid().safeParse(prospectId).success) return { ok: false, error: 'Demande introuvable.' };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabaseAdmin() as unknown as SupabaseClient<any, any, any>;
  const { data } = await sb
    .schema('app')
    .from('prospects')
    .select('id, organization_id')
    .eq('id', prospectId)
    .eq('organization_id', garde.member.organizationId)
    .maybeSingle();
  if (!data) return { ok: false, error: 'Demande introuvable.' };

  const r = await ecrireSousLOrganisme(sb, {
    organizationId: garde.member.organizationId,
    userId: garde.member.userId,
    destinataire: p.data.destinataire,
    objet: p.data.objet,
    message: p.data.message,
    prospectId: prospectId,
  });
  if (!r.ok) return r;

  // Le contenu va dans l'historique de la fiche : le journal des e-mails ne
  // garde que l'objet, et c'est ce qui a été DIT qu'on cherche en reprenant.
  const { error } = await sb
    .schema('app')
    .from('prospect_events')
    .insert({
      organization_id: garde.member.organizationId,
      prospect_id: prospectId,
      kind: 'comment',
      actor_user_id: garde.member.userId,
      payload: {
        channel: 'email',
        via: 'application',
        to: p.data.destinataire,
        subject: p.data.objet,
        text: p.data.message,
        provider_id: r.providerId,
      },
    } as never);
  if (error) console.error('[demande] e-mail parti mais non inscrit à l’historique', prospectId, error.message);

  revalidatePath(`/prospects/${prospectId}`);
  return r;
}
