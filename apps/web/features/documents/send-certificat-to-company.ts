import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { sendEmail } from '@/shared/lib/email/resend';
import { buildCertificatPdf } from './build-certificat-pdf';

/**
 * Certificat de réalisation adressé à l'entreprise cliente en fin de formation
 * (comme RFC) : c'est elle qui le transmet à son OPCO pour être remboursée.
 * Le particulier le reçoit déjà avec son e-mail de fin de formation.
 */
export async function sendCertificatToCompany(
  sb: SupabaseClient,
  dossierId: string,
): Promise<{ ok: true } | { ok: false; reason: 'no_company' | 'no_contact_email' | 'not_found' | 'send_failed' }> {
  const { data } = await sb
    .schema('app')
    .from('dossiers')
    .select('organization_id, company:companies(name, contact_name, contact_email)')
    .eq('id', dossierId)
    .maybeSingle();
  const row = data as {
    organization_id: string;
    company: { name: string; contact_name: string | null; contact_email: string | null } | null;
  } | null;
  if (!row) return { ok: false, reason: 'not_found' };
  if (!row.company) return { ok: false, reason: 'no_company' };
  if (!row.company.contact_email) return { ok: false, reason: 'no_contact_email' };

  const built = await buildCertificatPdf(sb, dossierId, { persist: true });
  if (!built) return { ok: false, reason: 'not_found' };

  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const html = `<!DOCTYPE html><html><body style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;background:#fafafa;padding:32px;">
<div style="max-width:540px;margin:auto;background:#fff;border:1px solid #e4e4e7;border-radius:12px;padding:28px;">
<p style="font-size:11px;text-transform:uppercase;letter-spacing:0.08em;color:#f97316;margin:0 0 8px;">Fin de formation</p>
<h1 style="font-size:18px;margin:0 0 12px;">Certificat de réalisation</h1>
<p style="color:#3f3f46;font-size:14px;line-height:1.6;">Bonjour ${esc(row.company.contact_name ?? row.company.name)},</p>
<p style="color:#3f3f46;font-size:14px;line-height:1.6;">La formation <strong>${esc(built.formationTitle)}</strong> de
<strong>${esc(built.learnerName)}</strong> est terminée. Vous trouverez ci-joint son certificat de réalisation, à transmettre
le cas échéant à votre OPCO.</p>
</div></body></html>`;

  const res = await sendEmail({
    to: row.company.contact_email,
    subject: `Certificat de réalisation — ${built.learnerName} (${built.formationTitle})`,
    html,
    attachments: [{ filename: `certificat-${built.reference}.pdf`, content: Buffer.from(built.bytes).toString('base64') }],
    organizationId: row.organization_id,
    dossierId,
    kind: 'certificat_entreprise',
  });
  return res.ok ? { ok: true } : { ok: false, reason: 'send_failed' };
}
