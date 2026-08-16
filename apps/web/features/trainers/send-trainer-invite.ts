import 'server-only';
import { supabaseAdmin } from '@/shared/lib/supabase/admin';
import { sendEmail } from '@/shared/lib/email/resend';
import { trainerWelcomeEmail } from '@/shared/lib/email/templates';
import { env } from '@/env.mjs';

/**
 * Invitation d'un formateur à finaliser son espace.
 *
 * On génère nous-mêmes le lien (admin API) et on l'envoie par l'e-mail de l'app
 * (Resend/SMTP) : l'e-mail intégré de Supabase Auth n'est pas fiable en prod
 * sans SMTP custom — même raison que la réinitialisation de mot de passe.
 * `inviteUserByEmail` s'appuyait dessus, et l'invitation n'arrivait pas.
 */
export type InviteResult =
  | { ok: true; existingAccount: boolean }
  | { ok: false; reason: 'link_failed' | 'send_failed'; details?: string };

export async function sendTrainerInvite(args: {
  email: string;
  firstName: string;
  orgName: string;
}): Promise<InviteResult> {
  const admin = supabaseAdmin();
  const baseUrl = (env.PUBLIC_APP_URL ?? '').replace(/\/$/, '');
  const redirectTo = `${baseUrl}/formateur`;

  // `invite` échoue si l'utilisateur existe déjà : on retombe alors sur un lien
  // de connexion, pour que l'e-mail parte dans les deux cas.
  let existingAccount = false;
  let link: string | null = null;

  const invite = await admin.auth.admin.generateLink({
    type: 'invite',
    email: args.email,
    options: { redirectTo },
  });
  link = invite.data?.properties?.action_link ?? null;

  if (!link) {
    existingAccount = true;
    const magic = await admin.auth.admin.generateLink({
      type: 'magiclink',
      email: args.email,
      options: { redirectTo },
    });
    link = magic.data?.properties?.action_link ?? null;
    if (!link) {
      console.error('[sendTrainerInvite] generateLink', invite.error?.message, magic.error?.message);
      return { ok: false, reason: 'link_failed', details: magic.error?.message ?? invite.error?.message };
    }
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
