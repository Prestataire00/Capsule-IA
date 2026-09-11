import 'server-only';
import { supabaseAdmin } from '@/shared/lib/supabase/admin';
import { sendEmail } from '@/shared/lib/email/resend';
import { trainerWelcomeEmail } from '@/shared/lib/email/templates';
import { authCallbackLink } from '@/shared/lib/auth/email-link';
import { env } from '@/env.mjs';

/**
 * Invitation d'un formateur à finaliser son espace.
 *
 * On génère nous-mêmes le lien (admin API) et on l'envoie par l'e-mail de l'app
 * (Resend/SMTP) : l'e-mail intégré de Supabase Auth n'est pas fiable en prod
 * sans SMTP custom — même raison que la réinitialisation de mot de passe.
 * `inviteUserByEmail` s'appuyait dessus, et l'invitation n'arrivait pas.
 *
 * Le lien passe par `/auth/callback` (voir `authCallbackLink`) : le formateur
 * choisit son mot de passe, puis arrive dans son espace. Un compte déjà créé
 * (invitation renvoyée, mot de passe jamais choisi) reçoit un lien de
 * réinitialisation : même parcours.
 */
export type InviteResult =
  | { ok: true; existingAccount: boolean }
  | { ok: false; reason: 'link_failed' | 'send_failed'; details?: string };

const APRES_MOT_DE_PASSE = `/auth/reset-password?next=${encodeURIComponent('/formateur')}`;

export async function sendTrainerInvite(args: {
  email: string;
  firstName: string;
  orgName: string;
  /** Fiche à rattacher au compte invité (sinon : rattachement par e-mail à la première visite). */
  trainerId?: string;
}): Promise<InviteResult> {
  const admin = supabaseAdmin();
  const baseUrl = (env.PUBLIC_APP_URL ?? '').replace(/\/$/, '');
  if (!baseUrl) return { ok: false, reason: 'link_failed', details: 'PUBLIC_APP_URL manquant' };

  // `invite` échoue si l'utilisateur existe déjà : on retombe alors sur un lien
  // de réinitialisation, pour que l'e-mail parte dans les deux cas.
  let existingAccount = false;
  let link: string | null = null;

  const invite = await admin.auth.admin.generateLink({ type: 'invite', email: args.email });
  const inviteHash = invite.data?.properties?.hashed_token;
  let userId = invite.data?.user?.id ?? null;
  if (inviteHash) link = authCallbackLink(baseUrl, inviteHash, 'invite', APRES_MOT_DE_PASSE);

  if (!link) {
    existingAccount = true;
    const recovery = await admin.auth.admin.generateLink({ type: 'recovery', email: args.email });
    const recoveryHash = recovery.data?.properties?.hashed_token;
    if (!recoveryHash) {
      console.error('[sendTrainerInvite] generateLink', invite.error?.message, recovery.error?.message);
      return { ok: false, reason: 'link_failed', details: recovery.error?.message ?? invite.error?.message };
    }
    userId = recovery.data?.user?.id ?? null;
    link = authCallbackLink(baseUrl, recoveryHash, 'recovery', APRES_MOT_DE_PASSE);
  }

  // La fiche est rattachée au compte qui recevra le lien, dès maintenant : le
  // rattachement par e-mail à la première visite échouait si la fiche pointait
  // déjà vers un autre compte (ancien compte, adresse corrigée), et le formateur
  // était alors refusé de son propre espace.
  if (args.trainerId && userId) {
    const { error } = await admin
      .schema('app')
      .from('trainers')
      .update({ user_id: userId } as never)
      .eq('id', args.trainerId)
      .is('deleted_at', null);
    if (error) console.error('[sendTrainerInvite] rattachement de la fiche', error.message);
  }

  const tpl = trainerWelcomeEmail({
    firstName: args.firstName,
    orgName: args.orgName,
    actionUrl: link,
    existingAccount,
  });

  const sent = await sendEmail({ to: args.email, subject: tpl.subject, html: tpl.html });
  if (!sent.ok) {
    console.error('[sendTrainerInvite] sendEmail', sent);
    return { ok: false, reason: 'send_failed', details: sent.reason };
  }

  return { ok: true, existingAccount };
}
