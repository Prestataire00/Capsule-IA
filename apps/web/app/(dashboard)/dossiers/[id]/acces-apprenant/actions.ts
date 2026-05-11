'use server';

import { createClient } from '@supabase/supabase-js';
import QRCode from 'qrcode';
import { env } from '@/env.mjs';
import { generateApprenantUrl } from '@/shared/lib/apprenant-token';
import { sendEmail } from '@/shared/lib/email/resend';

const admin = () =>
  createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

const escapeHtml = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export type GenerateLinkResult =
  | { ok: true; url: string; qrDataUrl: string; expiresAt: string; learnerEmail: string | null; learnerName: string }
  | { ok: false; error: string };

export async function generateApprenantLink(dossierId: string): Promise<GenerateLinkResult> {
  const sb = admin();
  const { data, error } = await sb
    .schema('app')
    .from('dossiers')
    .select('id, organization_id, learner_id, learner:learners(first_name, last_name, email)')
    .eq('id', dossierId)
    .maybeSingle();

  if (error || !data) {
    return { ok: false, error: 'dossier_not_found' };
  }
  const row = data as unknown as {
    id: string;
    organization_id: string;
    learner_id: string;
    learner: { first_name: string; last_name: string; email: string } | null;
  };

  if (!env.PUBLIC_APP_URL) {
    return { ok: false, error: 'public_app_url_missing' };
  }

  const signed = await generateApprenantUrl(
    { learnerId: row.learner_id, organizationId: row.organization_id, dossierId: row.id },
    env.PUBLIC_APP_URL,
  );

  const qrDataUrl = await QRCode.toDataURL(signed.url, {
    errorCorrectionLevel: 'M',
    margin: 1,
    width: 320,
    color: { dark: '#18181b', light: '#ffffff' },
  });

  return {
    ok: true,
    url: signed.url,
    qrDataUrl,
    expiresAt: signed.expiresAt.toISOString(),
    learnerEmail: row.learner?.email ?? null,
    learnerName: row.learner ? `${row.learner.first_name} ${row.learner.last_name}` : 'Apprenant',
  };
}

export type SendLinkResult =
  | { ok: true; emailId: string }
  | { ok: false; error: string };

export async function sendApprenantLinkEmail(input: {
  url: string;
  learnerEmail: string;
  learnerName: string;
}): Promise<SendLinkResult> {
  const expiresInDays = 90;

  const result = await sendEmail({
    to: input.learnerEmail,
    subject: `Votre espace de formation est prêt`,
    html: `<!DOCTYPE html><html><body style="font-family:-apple-system,sans-serif;color:#18181b;line-height:1.55;background:#fafafa;margin:0;padding:24px;">
  <div style="max-width:560px;margin:0 auto;">
    <div style="background:white;border:1px solid #e4e4e7;border-radius:12px;padding:32px;">
      <p style="font-size:11px;text-transform:uppercase;letter-spacing:0.08em;color:#7c3aed;font-weight:600;margin:0 0 8px;">Votre espace apprenant</p>
      <h1 style="font-size:22px;font-weight:600;margin:0 0 12px;">Bonjour ${escapeHtml(input.learnerName.split(' ')[0] ?? '')} 👋</h1>
      <p style="font-size:14px;color:#52525b;margin:0 0 24px;">
        Votre espace personnel pour suivre votre formation est prêt. Vous y retrouverez votre programme,
        vos sessions, vos documents, et pourrez nous adresser vos réclamations directement.
      </p>
      <div style="text-align:center;margin:32px 0;">
        <a href="${input.url}" style="display:inline-block;padding:14px 28px;background:#7c3aed;color:white;text-decoration:none;border-radius:10px;font-size:14px;font-weight:600;">
          Accéder à mon espace
        </a>
      </div>
      <p style="font-size:12px;color:#71717a;margin:0 0 4px;">Ou copiez ce lien :</p>
      <p style="font-family:ui-monospace,monospace;font-size:11px;color:#27272a;word-break:break-all;background:#f4f4f5;padding:10px 12px;border-radius:6px;margin:0 0 20px;">${input.url}</p>
      <p style="font-size:11px;color:#a1a1aa;margin:24px 0 0;border-top:1px solid #f4f4f5;padding-top:16px;">
        Lien personnel et sécurisé, valable ${expiresInDays} jours. Ne le partagez pas.
      </p>
    </div>
  </div>
</body></html>`,
  });

  if (!result.ok) {
    return { ok: false, error: result.reason };
  }
  return { ok: true, emailId: result.id };
}
