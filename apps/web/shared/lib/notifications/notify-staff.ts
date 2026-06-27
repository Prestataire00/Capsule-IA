import 'server-only';
import { supabaseAdmin } from '@/shared/lib/supabase/admin';
import type { SupabaseClient } from '@supabase/supabase-js';
import { sendEmail } from '@/shared/lib/email/resend';
import { env } from '@/env.mjs';

type DemandeSummary = {
  name: string;
  situationLabel: string;
  companyName: string | null;
  employeesCount: number | null;
};

type Recipient = { user_id: string; email: string };

function buildHtml(s: DemandeSummary, url: string | null): string {
  const lines = [
    `<strong>${s.name}</strong>`,
    s.companyName ? `Entreprise : ${s.companyName}` : null,
    `Situation : ${s.situationLabel}`,
    s.employeesCount ? `${s.employeesCount} salarié(s) à inscrire` : null,
  ].filter(Boolean);
  return `<!DOCTYPE html><html><body style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;background:#fafafa;padding:32px;">
<div style="max-width:520px;margin:auto;background:#fff;border:1px solid #e4e4e7;border-radius:12px;padding:28px;">
<h1 style="font-size:18px;margin:0 0 8px;">Nouvelle demande d'inscription</h1>
<p style="color:#3f3f46;font-size:14px;line-height:1.6;">${lines.join('<br>')}</p>
<p style="color:#3f3f46;font-size:14px;">Vérifiez les pièces justificatives et validez la demande.</p>
${url ? `<a href="${url}" style="display:inline-block;margin-top:8px;background:#7c3aed;color:#fff;text-decoration:none;font-size:14px;padding:10px 18px;border-radius:8px;">Ouvrir la demande</a>` : ''}
<p style="color:#a1a1aa;font-size:11px;margin-top:16px;">Capsule IA</p></div></body></html>`;
}

/**
 * Notifie le staff (owner/admin/gestionnaire) de l'org d'une nouvelle demande :
 * notifications in-app (1 par destinataire) + emails. Non-bloquant.
 * Fallback à OF_NOTIFICATION_EMAIL si pas d'org (prospect non assigné).
 */
export async function notifyOrgStaffOfNewDemande(args: {
  organizationId: string | null;
  prospectId: string;
  replyTo?: string;
  summary: DemandeSummary;
}): Promise<void> {
  try {
    await deliver(args);
  } catch (e) {
    console.error('[notify-staff] delivery failed', e);
  }
}

async function deliver(args: {
  organizationId: string | null;
  prospectId: string;
  replyTo?: string;
  summary: DemandeSummary;
}): Promise<void> {
  const url = env.PUBLIC_APP_URL
    ? `${env.PUBLIC_APP_URL.replace(/\/$/, '')}/prospects/${args.prospectId}`
    : null;
  const html = buildHtml(args.summary, url);
  const subject = `Nouvelle demande — ${args.summary.companyName ?? args.summary.name}`;
  const admin = supabaseAdmin() as unknown as SupabaseClient;

  let recipients: Recipient[] = [];
  if (args.organizationId) {
    const { data } = await admin
      .schema('app')
      .rpc('staff_recipients', { p_org: args.organizationId } as never);
    recipients = ((data as Recipient[] | null) ?? []).filter((r) => r.email);
  }

  if (recipients.length === 0) {
    // Fallback : email global de l'OF.
    if (env.OF_NOTIFICATION_EMAIL) {
      void sendEmail({ to: env.OF_NOTIFICATION_EMAIL, subject, html, replyTo: args.replyTo }).then((r) => {
        if (!r.ok) console.error('[notify-staff] fallback email failed', r);
      });
    }
    return;
  }

  // In-app : 1 notification par destinataire.
  const rows = recipients.map((r) => ({
    organization_id: args.organizationId,
    channel: 'in_app',
    template_code: 'prospect.new_demande',
    recipient_user_id: r.user_id,
    subject,
    payload: {
      prospect_id: args.prospectId,
      name: args.summary.name,
      company_name: args.summary.companyName,
    },
    status: 'sent',
    sent_at: new Date().toISOString(),
    related_aggregate_type: 'prospect',
    related_aggregate_id: args.prospectId,
  }));
  await admin.schema('app').from('notifications').insert(rows as never);

  // Emails : fire-and-forget.
  void Promise.all(
    recipients.map((r) =>
      sendEmail({ to: r.email, subject, html, replyTo: args.replyTo }).then((res) => {
        if (!res.ok) console.error('[notify-staff] email failed', r.email, res);
      }),
    ),
  );
}
