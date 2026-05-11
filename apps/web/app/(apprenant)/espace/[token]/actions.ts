'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { env } from '@/env.mjs';
import { sendEmail } from '@/shared/lib/email/resend';
import { learners } from '@/shared/mock/data';

const COMPLAINT_CATEGORIES = [
  'pedagogie',
  'organisation',
  'accessibilite',
  'administratif',
  'relation',
  'autre',
] as const;

const CATEGORY_LABELS: Record<(typeof COMPLAINT_CATEGORIES)[number], string> = {
  pedagogie: 'Contenu / pédagogie',
  organisation: 'Organisation / logistique',
  accessibilite: 'Accessibilité',
  administratif: 'Administratif',
  relation: 'Relation formateur',
  autre: 'Autre',
};

const complaintSchema = z.object({
  token: z.string().trim().min(3),
  category: z.enum(COMPLAINT_CATEGORIES),
  subject: z.string().trim().min(3, 'Sujet trop court').max(200),
  description: z.string().trim().min(10, 'Description trop courte').max(5000),
});

const admin = () =>
  createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function generateReference(): string {
  const year = new Date().getFullYear();
  const random = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `REC-${year}-${random}`;
}

export async function submitComplaint(formData: FormData): Promise<void> {
  const parsed = complaintSchema.safeParse({
    token: formData.get('token'),
    category: formData.get('category'),
    subject: formData.get('subject'),
    description: formData.get('description'),
  });

  if (!parsed.success) {
    redirect(
      `/espace/${formData.get('token') ?? 'unknown'}#reclamation?error=invalid_input`,
    );
  }
  const { token, category, subject, description } = parsed.data;

  // VF : tous les tokens mappent à Alice (l-1). En prod, ce sera un JWT signé
  // avec TOKEN_SIGNING_KEY contenant learner_id + dossier_id + org_id.
  const learner = learners.find((l) => l.id === 'l-1');
  const reporterName = learner ? `${learner.firstName} ${learner.lastName}` : null;
  const reporterEmail = learner?.email ?? null;

  const supabase = admin();

  const { data: orgRow, error: orgErr } = await supabase
    .schema('app')
    .from('organizations')
    .select('id, name')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (orgErr || !orgRow) {
    console.error('[submitComplaint] no organization found', orgErr);
    redirect(`/espace/${token}#reclamation?error=no_organization`);
  }
  const org = orgRow as { id: string; name: string };

  const h = headers();
  const reference = generateReference();

  const insertRow = {
    organization_id: org.id,
    reference,
    learner_id: null,
    dossier_id: null,
    company_id: null,
    source: 'questionnaire',
    channel: 'espace_apprenant',
    reporter_name: reporterName,
    reporter_email: reporterEmail,
    subject,
    description,
    severity: 'medium',
    status: 'open',
    metadata: {
      category,
      category_label: CATEGORY_LABELS[category],
      submitted_from: 'espace_apprenant',
      token_preview: token.slice(0, 8),
      ip_address: h.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
      user_agent: h.get('user-agent') ?? null,
    },
  };

  const { data: created, error: insertErr } = await supabase
    .schema('app')
    .from('complaints')
    .insert(insertRow)
    .select('id, reference')
    .single();

  if (insertErr || !created) {
    console.error('[submitComplaint] insert failed', insertErr);
    redirect(`/espace/${token}#reclamation?error=db_error`);
  }
  const complaint = created as { id: string; reference: string };

  // Notif interne (best effort)
  if (env.OF_NOTIFICATION_EMAIL) {
    const dashboardUrl = env.PUBLIC_APP_URL
      ? `${env.PUBLIC_APP_URL.replace(/\/$/, '')}/reclamations/${complaint.id}`
      : null;

    void sendEmail({
      to: env.OF_NOTIFICATION_EMAIL,
      subject: `🚨 Nouvelle réclamation · ${subject}`,
      replyTo: reporterEmail ?? undefined,
      html: `
<!DOCTYPE html><html><body style="font-family:-apple-system,sans-serif;color:#18181b;line-height:1.55;background:#fafafa;margin:0;padding:24px;">
  <div style="max-width:580px;margin:0 auto;">
    <div style="background:white;border:1px solid #e4e4e7;border-radius:12px;padding:24px;">
      <p style="font-size:11px;text-transform:uppercase;letter-spacing:0.08em;color:#dc2626;font-weight:600;margin:0 0 8px;">Nouvelle réclamation Qualiopi</p>
      <h1 style="font-size:20px;font-weight:600;margin:0 0 12px;">${escapeHtml(subject)}</h1>
      <p style="font-size:13px;color:#71717a;margin:0 0 16px;">
        Référence : <span style="font-family:ui-monospace,monospace;font-weight:500;color:#18181b;">${complaint.reference}</span>
      </p>
      <table style="width:100%;border-collapse:collapse;border-top:1px solid #f4f4f5;">
        <tr><td style="padding:8px 0;font-size:12px;color:#71717a;">Catégorie</td><td style="padding:8px 0;font-size:13px;font-weight:500;text-align:right;">${escapeHtml(CATEGORY_LABELS[category])}</td></tr>
        ${reporterName ? `<tr><td style="padding:8px 0;font-size:12px;color:#71717a;">Apprenant</td><td style="padding:8px 0;font-size:13px;font-weight:500;text-align:right;">${escapeHtml(reporterName)}</td></tr>` : ''}
        ${reporterEmail ? `<tr><td style="padding:8px 0;font-size:12px;color:#71717a;">Email</td><td style="padding:8px 0;font-size:13px;font-weight:500;text-align:right;"><a href="mailto:${reporterEmail}" style="color:#7c3aed;text-decoration:none;">${escapeHtml(reporterEmail)}</a></td></tr>` : ''}
        <tr><td style="padding:8px 0;font-size:12px;color:#71717a;">Statut</td><td style="padding:8px 0;font-size:13px;font-weight:500;text-align:right;">À traiter (15 j ouvrés)</td></tr>
      </table>
      <div style="margin-top:20px;padding:12px 14px;background:#fafafa;border-radius:8px;border-left:3px solid #dc2626;">
        <p style="font-size:11px;text-transform:uppercase;letter-spacing:0.06em;color:#71717a;margin:0 0 4px;font-weight:500;">Description</p>
        <p style="font-size:13px;color:#27272a;margin:0;white-space:pre-wrap;">${escapeHtml(description)}</p>
      </div>
      ${dashboardUrl ? `<div style="margin-top:24px;"><a href="${dashboardUrl}" style="display:inline-block;padding:10px 18px;background:#7c3aed;color:white;text-decoration:none;border-radius:8px;font-size:13px;font-weight:500;">Traiter dans le dashboard</a></div>` : ''}
    </div>
    <p style="font-size:11px;color:#a1a1aa;margin-top:24px;text-align:center;">i-a-infinity OF · ${escapeHtml(org.name)}</p>
  </div>
</body></html>
      `,
    }).then((r) => {
      if (!r.ok && r.reason !== 'no_api_key') {
        console.error('[submitComplaint] notif email failed', r);
      }
    });
  }

  redirect(`/espace/${token}/reclamation/envoyee?ref=${complaint.reference}`);
}
