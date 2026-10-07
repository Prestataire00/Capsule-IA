import 'server-only';
import { supabaseAdmin } from '@/shared/lib/supabase/admin';
import { sendEmail } from '@/shared/lib/email/resend';
import { expediteurDeLOrganisme } from '@/shared/lib/email/expediteur-organisme';

/**
 * Écrire au client depuis l'adresse de l'organisme ; si le prestataire la
 * refuse (domaine non vérifié), depuis celle du serveur, les réponses
 * revenant toujours à l'organisme.
 */
export async function envoyerSousOrganisme(m: {
  organizationId: string;
  dossierId?: string;
  to: string;
  subject: string;
  html: string;
  kind: string;
}): Promise<boolean> {
  const expediteur = await expediteurDeLOrganisme(supabaseAdmin(), m.organizationId);
  const commun = {
    to: m.to,
    subject: m.subject,
    html: m.html,
    organizationId: m.organizationId,
    dossierId: m.dossierId,
    kind: m.kind,
    ...(expediteur.email ? { replyTo: expediteur.email } : {}),
  };
  const envoi = await sendEmail({ ...commun, from: expediteur.from });
  if (envoi.ok) return true;
  if (envoi.reason !== 'send_failed' || expediteur.source !== 'organisme') return false;
  return (await sendEmail({ ...commun, metadata: { source: 'repli' } })).ok;
}
