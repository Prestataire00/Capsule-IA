import { NextResponse, type NextRequest } from 'next/server';
import { env } from '@/env.mjs';
import { sendEmail } from '@/shared/lib/email/resend';

// Endpoint diagnostic : envoie un email de test via sendEmail() (SMTP ou Resend
// selon la config). Protégé par CRON_SECRET. Usage :
//   GET /api/admin/test-email?secret=<CRON_SECRET>&to=destinataire@exemple.com
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// En-tête uniquement, et comparaison à temps constant : cette route envoie un
// e-mail vers une adresse arbitraire, le secret ne doit pas traîner dans une URL.
const authorized = (req: NextRequest): boolean => verifierSecretMachine(req);

export async function GET(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }
  const params = new URL(req.url).searchParams;

  // Mode debug : reporte quelles variables d'env sont chargées par le conteneur
  // (booléens seulement, aucune valeur exposée), sans envoyer d'email.
  if (params.get('debug') === '1') {
    return NextResponse.json({
      ok: true,
      mode: 'debug',
      env: {
        SMTP_HOST: Boolean(env.SMTP_HOST),
        SMTP_PORT: env.SMTP_PORT ?? null,
        SMTP_USER: Boolean(env.SMTP_USER),
        SMTP_PASS: Boolean(env.SMTP_PASS),
        EMAIL_FROM_present: Boolean(env.EMAIL_FROM),
        EMAIL_FROM_value: env.EMAIL_FROM ?? null,
        RESEND_API_KEY: Boolean(env.RESEND_API_KEY),
        PUBLIC_APP_URL: env.PUBLIC_APP_URL ?? null,
      },
      transport: env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASS ? 'smtp' : 'resend',
    });
  }

  const to = params.get('to');
  if (!to) {
    return NextResponse.json({ ok: false, error: 'missing_to' }, { status: 400 });
  }

  const html = `<!DOCTYPE html><html><body style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;background:#fafafa;padding:32px;">
<div style="max-width:520px;margin:auto;background:#fff;border:1px solid #e4e4e7;border-radius:12px;padding:28px;">
<h1 style="font-size:20px;margin:0 0 8px;">Capsule IA &mdash; email de test</h1>
<p style="color:#3f3f46;font-size:14px;line-height:1.5;">L'envoi d'emails de la plateforme <strong>Capsule IA</strong> fonctionne.</p>
<p style="margin:20px 0;"><a href="https://capsule-ia.up.railway.app" style="display:inline-block;padding:10px 18px;background:#7c3aed;color:#fff;text-decoration:none;border-radius:8px;font-size:13px;">Ouvrir Capsule IA</a></p>
<p style="color:#a1a1aa;font-size:11px;">https://capsule-ia.up.railway.app</p></div></body></html>`;

  const result = await sendEmail({ to, subject: 'Capsule IA — email de test', html, kind: 'test' });
  return NextResponse.json(result, { status: result.ok ? 200 : 502 });
}

export const POST = GET;
