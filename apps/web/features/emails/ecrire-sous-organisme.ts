import 'server-only';
// Écrire à un client sous l'adresse de l'organisme — depuis un dossier comme
// depuis une demande.
//
// Les boutons ouvraient `mailto:`, donc la messagerie personnelle de celui qui
// clique : le client recevait un message d'une adresse privée, l'échange
// n'apparaissait nulle part dans le CRM, et la réponse partait dans une boîte
// que personne d'autre ne relit. Un seul chemin d'envoi pour les deux fiches :
// deux copies auraient fini par partir de deux adresses différentes.

import type { SupabaseClient } from '@supabase/supabase-js';
import { sendEmail, adresseExpediteur } from '@/shared/lib/email/resend';
import { expediteurDeLOrganisme } from '@/shared/lib/email/expediteur-organisme';

export type EcrireResult = { ok: true; message: string; providerId: string } | { ok: false; error: string };

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

export async function ecrireSousLOrganisme(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sb: SupabaseClient<any, any, any>,
  args: {
    organizationId: string;
    userId: string;
    destinataire: string;
    objet: string;
    message: string;
    /** Rattache l'envoi à l'historique du dossier. */
    dossierId?: string;
    /** Rattache l'envoi à la fiche demande. */
    prospectId?: string;
  },
): Promise<EcrireResult> {
  // Un seul aller-retour : l'expéditeur porte déjà le nom de l'organisme, qui
  // signe le pied du message.
  const expediteur = await expediteurDeLOrganisme(sb, args.organizationId);
  const html = corpsHtml(args.message, expediteur.nom);
  // Le contexte est passé à l'envoi : c'est lui qui journalise, et une ligne
  // sans dossier n'apparaîtrait pas dans l'historique du dossier.
  // Journalisé dans les deux cas : un envoi raté qui ne laisse aucune trace se
  // rejoue à l'identique, et personne ne sait qu'il a déjà échoué.
  const contexte = {
    to: args.destinataire,
    subject: args.objet,
    html,
    organizationId: args.organizationId,
    dossierId: args.dossierId,
    kind: 'message_direct',
  };
  const trace = args.prospectId ? { prospect_id: args.prospectId } : {};

  let envoi = await sendEmail({
    ...contexte,
    from: expediteur.from,
    // Les réponses reviennent à l'organisme, quoi qu'il arrive à l'en-tête
    // d'expédition en route.
    ...(expediteur.email ? { replyTo: expediteur.email } : {}),
    metadata: { par: args.userId, expediteur: expediteur.from, source: expediteur.source, ...trace },
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
      metadata: { par: args.userId, expediteur: adresseExpediteur(), source: 'repli', refusee: expediteur.from, ...trace },
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

  const depuis = repli
    ? `${adresseExpediteur()} (${expediteur.from} a été refusée : domaine à vérifier chez le prestataire d’envoi)`
    : expediteur.from;
  return { ok: true, message: `Message envoyé à ${args.destinataire}, depuis ${depuis}.`, providerId: envoi.id };
}
