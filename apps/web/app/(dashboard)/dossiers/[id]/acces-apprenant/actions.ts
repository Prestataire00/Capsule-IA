'use server';

import { createClient } from '@supabase/supabase-js';
import QRCode from 'qrcode';
import { env } from '@/env.mjs';
import { generateApprenantUrl } from '@/shared/lib/apprenant-token';
import { sendEmail } from '@/shared/lib/email/resend';
import { welcomePacketEmail } from '@/shared/lib/email/templates';

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

// ────────────────────────────────────────────────────────────────
// Welcome packet — dossier d'entrée
// Envoyé manuellement quand l'OF confirme l'inscription. Inclut le
// récap complet (dates, durée, modalité, formateur) + lien espace
// apprenant + URL convention PDF.
// ────────────────────────────────────────────────────────────────

export type SendWelcomePacketResult =
  | { ok: true; emailId: string }
  | { ok: false; error: string };

export async function sendWelcomePacketEmail(dossierId: string): Promise<SendWelcomePacketResult> {
  const sb = admin();

  const { data: dossierRow, error: dossierErr } = await sb
    .schema('app')
    .from('dossiers')
    .select(`
      id, organization_id, start_date, end_date, total_hours, modality,
      learner_id,
      learner:learners(first_name, last_name, email),
      formation:formations(title)
    `)
    .eq('id', dossierId)
    .maybeSingle();

  if (dossierErr || !dossierRow) {
    return { ok: false, error: 'dossier_not_found' };
  }

  const d = dossierRow as unknown as {
    id: string;
    organization_id: string;
    start_date: string;
    end_date: string;
    total_hours: number;
    modality: string;
    learner_id: string;
    learner: { first_name: string; last_name: string; email: string } | null;
    formation: { title: string } | null;
  };

  if (!d.learner || !d.learner.email) {
    return { ok: false, error: 'learner_email_missing' };
  }

  // Premier formateur du dossier (s'il y en a un)
  let trainerName: string | null = null;
  let trainerEmail: string | null = null;
  const { data: dtRow } = await sb
    .schema('app')
    .from('dossier_trainers')
    .select('trainer_id')
    .eq('dossier_id', dossierId)
    .limit(1)
    .maybeSingle();
  if (dtRow) {
    const trainerId = (dtRow as { trainer_id: string }).trainer_id;
    const { data: tRow } = await sb
      .schema('app')
      .from('trainers')
      .select('first_name, last_name, email')
      .eq('id', trainerId)
      .maybeSingle();
    if (tRow) {
      const t = tRow as { first_name: string; last_name: string; email: string | null };
      trainerName = `${t.first_name} ${t.last_name}`;
      trainerEmail = t.email;
    }
  }

  // URL espace apprenant signée
  const baseUrl = env.PUBLIC_APP_URL ?? 'http://localhost:3000';
  let espaceUrl: string | null = null;
  try {
    const signed = await generateApprenantUrl(
      {
        learnerId: d.learner_id,
        organizationId: d.organization_id,
        dossierId: d.id,
      },
      baseUrl,
    );
    espaceUrl = signed.url;
  } catch (e) {
    console.error('[sendWelcomePacketEmail] token generation failed', e);
  }

  // URL convention PDF (route déjà existante)
  const conventionUrl = `${baseUrl.replace(/\/$/, '')}/api/dossiers/${d.id}/convention.pdf`;

  const tpl = welcomePacketEmail({
    firstName: d.learner.first_name,
    formationTitle: d.formation?.title ?? 'Votre formation',
    startDate: d.start_date,
    endDate: d.end_date,
    totalHours: d.total_hours,
    modality: d.modality,
    trainerName,
    trainerEmail,
    espaceUrl,
    conventionUrl,
  });

  const result = await sendEmail({
    to: d.learner.email,
    subject: tpl.subject,
    html: tpl.html,
  });

  if (!result.ok) {
    return { ok: false, error: result.reason };
  }
  return { ok: true, emailId: result.id };
}
