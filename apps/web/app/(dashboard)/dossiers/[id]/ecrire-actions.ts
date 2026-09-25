'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { createClient } from '@supabase/supabase-js';
import { env } from '@/env.mjs';
import { guardAction } from '@/shared/lib/auth/guard-action';
import { sendEmail, adresseExpediteur } from '@/shared/lib/email/resend';
import { expediteurDeLOrganisme } from '@/shared/lib/email/expediteur-organisme';

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

export type EcrireResult = { ok: true; message: string } | { ok: false; error: string };

const Schema = z.object({
  dossierId: z.string().uuid(),
  destinataire: z.string().trim().email('Adresse du destinataire invalide.'),
  objet: z.string().trim().min(1, 'Indiquez un objet.').max(200),
  message: z.string().trim().min(1, 'Écrivez votre message.').max(5000),
});

const echapper = (t: string) =>
  t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * Le message tapé, mis en page.
 *
 * Les retours à la ligne deviennent des paragraphes : envoyé brut, un texte
 * écrit en plusieurs alinéas arrive en un seul bloc, et se lit mal.
 */
function corpsHtml(message: string, organisme: string): string {
  const paragraphes = message
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 12px;font-size:14px;color:#3f3f46;">${echapper(p).replace(/\n/g, '<br>')}</p>`)
    .join('');
  return `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#fafafa;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#18181b;line-height:1.55;">
<div style="max-width:580px;margin:0 auto;padding:32px 24px;">
  <div style="background:#fff;border:1px solid #e4e4e7;border-radius:12px;padding:24px;">${paragraphes}</div>
  <p style="margin:16px 0 0;font-size:12px;color:#a1a1aa;text-align:center;">${echapper(organisme)}</p>
</div></body></html>`;
}

export async function ecrireAuClient(brut: z.input<typeof Schema>): Promise<EcrireResult> {
  // `crm` et non `dossiers` : écrire au client est un geste de relation, et
  // c'est la section que porte déjà la fiche demande.
  const garde = await guardAction('crm');
  if (!garde.ok) return { ok: false, error: garde.error };
  const p = Schema.safeParse(brut);
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? 'Saisie invalide.' };

  const sb = admin();
  const { data: dossier } = await sb
    .schema('app')
    .from('dossiers')
    .select('id, reference')
    .eq('id', p.data.dossierId)
    .eq('organization_id', garde.member.organizationId)
    .is('deleted_at', null)
    .maybeSingle();
  if (!dossier) return { ok: false, error: 'Dossier introuvable.' };

  // Un seul aller-retour : l'expéditeur porte déjà le nom de l'organisme, qui
  // signe le pied du message.
  const expediteur = await expediteurDeLOrganisme(sb, garde.member.organizationId);
  const html = corpsHtml(p.data.message, expediteur.nom);
  // Le contexte est passé à l'envoi : c'est lui qui journalise, et une ligne
  // sans dossier n'apparaîtrait pas dans l'historique du dossier.
  // Journalisé dans les deux cas : un envoi raté qui ne laisse aucune trace se
  // rejoue à l'identique, et personne ne sait qu'il a déjà échoué.
  const contexte = {
    to: p.data.destinataire,
    subject: p.data.objet,
    html,
    organizationId: garde.member.organizationId,
    dossierId: p.data.dossierId,
    kind: 'message_direct',
  };

  let envoi = await sendEmail({
    ...contexte,
    from: expediteur.from,
    // Les réponses reviennent à l'organisme, quoi qu'il arrive à l'en-tête
    // d'expédition en route.
    ...(expediteur.email ? { replyTo: expediteur.email } : {}),
    metadata: { par: garde.member.userId, expediteur: expediteur.from, source: expediteur.source },
  });

  // Repli : un domaine non vérifié chez le prestataire fait refuser l'envoi
  // (HTTP 422, « Invalid from »). Renvoyer sous l'adresse configurée du serveur
  // — en gardant le « Répondre à » de l'organisme — vaut mieux qu'un message
  // qui ne part pas : le client reçoit, et la réponse revient au bon endroit.
  let repli = false;
  if (!envoi.ok && envoi.reason === 'send_failed' && expediteur.source === 'organisme') {
    repli = true;
    envoi = await sendEmail({
      ...contexte,
      ...(expediteur.email ? { replyTo: expediteur.email } : {}),
      metadata: {
        par: garde.member.userId,
        expediteur: adresseExpediteur(),
        source: 'repli',
        refusee: expediteur.from,
      },
    });
  }

  if (!envoi.ok) {
    return {
      ok: false,
      error: repli
        ? `L’e-mail n’est pas parti, ni depuis ${expediteur.from}, ni depuis l’adresse du serveur. Il est noté comme échoué dans l’historique.`
        : 'L’e-mail n’est pas parti. Il est noté comme échoué dans l’historique.',
    };
  }

  revalidatePath(`/dossiers/${p.data.dossierId}`);
  const depuis = repli
    ? `${adresseExpediteur()} (${expediteur.from} a été refusée : domaine à vérifier chez le prestataire d’envoi)`
    : expediteur.from;
  return { ok: true, message: `Message envoyé à ${p.data.destinataire}, depuis ${depuis}.` };
}
