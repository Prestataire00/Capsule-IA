'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { env } from '@/env.mjs';
import { sendEmail } from '@/shared/lib/email/resend';

const admin = () =>
  createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

const createInvoiceSchema = z.object({
  dossierId: z.string().uuid('Dossier requis'),
  description: z.string().trim().min(3, 'Description trop courte').max(200),
  unitAmountCents: z.coerce.number().int().min(0),
  quantity: z.coerce.number().min(0.01).default(1),
  vatRate: z.coerce.number().min(0).max(100).default(20),
  dueAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Échéance invalide').optional().or(z.literal('')),
  issuedNow: z.coerce.boolean().default(false),
});

function generateInvoiceReference(): string {
  const year = new Date().getFullYear();
  const random = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `FAC-${year}-${random}`;
}

export async function createInvoice(formData: FormData): Promise<void> {
  const parsed = createInvoiceSchema.safeParse({
    dossierId: formData.get('dossierId'),
    description: formData.get('description'),
    unitAmountCents: formData.get('unitAmountCents'),
    quantity: formData.get('quantity') || '1',
    vatRate: formData.get('vatRate') || '20',
    dueAt: formData.get('dueAt'),
    issuedNow: formData.get('issuedNow') === 'on' ? 'true' : 'false',
  });

  if (!parsed.success) {
    redirect('/factures/nouvelle?error=invalid');
  }
  const data = parsed.data;

  const sb = admin();

  // Charge le dossier pour récupérer org/funder/company
  const { data: dossierRow } = await sb
    .schema('app')
    .from('dossiers')
    .select('organization_id, company_id, funder_id')
    .eq('id', data.dossierId)
    .maybeSingle();

  if (!dossierRow) {
    redirect('/factures/nouvelle?error=dossier_not_found');
  }
  const dossier = dossierRow as { organization_id: string; company_id: string | null; funder_id: string | null };

  const subtotalCents = Math.round(data.unitAmountCents * data.quantity);
  const vatCents = Math.round(subtotalCents * (data.vatRate / 100));
  const totalCents = subtotalCents + vatCents;
  const reference = generateInvoiceReference();
  const status = data.issuedNow ? 'issued' : 'draft';

  // Insert facture
  const { data: invoiceRow, error: insertErr } = await sb
    .schema('app')
    .from('invoices')
    .insert({
      organization_id: dossier.organization_id,
      reference,
      dossier_id: data.dossierId,
      funder_id: dossier.funder_id,
      company_id: dossier.company_id,
      status,
      issued_at: data.issuedNow ? new Date().toISOString().slice(0, 10) : null,
      due_at: data.dueAt || null,
      subtotal_cents: subtotalCents,
      vat_cents: vatCents,
      total_cents: totalCents,
      currency: 'EUR',
    })
    .select('id')
    .single();

  if (insertErr || !invoiceRow) {
    console.error('[createInvoice] insert failed', insertErr);
    redirect('/factures/nouvelle?error=db');
  }

  const invoiceId = (invoiceRow as { id: string }).id;

  // Insert 1 ligne
  await sb.schema('app').from('invoice_lines').insert({
    organization_id: dossier.organization_id,
    invoice_id: invoiceId,
    position: 0,
    description: data.description,
    quantity: data.quantity,
    unit_amount_cents: data.unitAmountCents,
    vat_rate: data.vatRate,
  });

  revalidatePath('/factures');
  redirect(`/factures?created=${invoiceId}`);
}

export type SendInvoiceResult =
  | { ok: true }
  | { ok: false; error: string };

export async function sendInvoiceByEmail(invoiceId: string): Promise<SendInvoiceResult> {
  const sb = admin();

  const { data: invRow } = await sb
    .schema('app')
    .from('invoices')
    .select(`
      id, reference, status, total_cents, vat_cents, subtotal_cents, currency, issued_at, due_at,
      dossier:dossiers(reference, learner:learners(first_name, last_name, email)),
      company:companies(name, contact_email)
    `)
    .eq('id', invoiceId)
    .maybeSingle();

  if (!invRow) return { ok: false, error: 'invoice_not_found' };

  const inv = invRow as unknown as {
    id: string;
    reference: string;
    status: string;
    total_cents: number;
    vat_cents: number;
    subtotal_cents: number;
    currency: string;
    issued_at: string | null;
    due_at: string | null;
    dossier: { reference: string; learner: { first_name: string; last_name: string; email: string } | null } | null;
    company: { name: string; contact_email: string | null } | null;
  };

  const recipientEmail = inv.company?.contact_email ?? inv.dossier?.learner?.email;
  if (!recipientEmail) return { ok: false, error: 'no_recipient_email' };

  const recipientName =
    inv.company?.name ??
    (inv.dossier?.learner ? `${inv.dossier.learner.first_name} ${inv.dossier.learner.last_name}` : 'Destinataire');

  const fmt = (cents: number) =>
    new Intl.NumberFormat('fr-FR', { style: 'currency', currency: inv.currency }).format(cents / 100);

  const subject = `Facture ${inv.reference} — ${fmt(inv.total_cents)}`;

  const html = `<!DOCTYPE html><html><body style="font-family:-apple-system,sans-serif;color:#18181b;line-height:1.55;background:#fafafa;margin:0;padding:24px;">
  <div style="max-width:580px;margin:0 auto;">
    <div style="background:white;border:1px solid #e4e4e7;border-radius:12px;padding:32px;">
      <p style="font-size:11px;text-transform:uppercase;letter-spacing:0.08em;color:#7c3aed;font-weight:600;margin:0 0 8px;">Facture émise</p>
      <h1 style="font-size:20px;font-weight:600;margin:0 0 16px;">${escapeHtml(inv.reference)}</h1>
      <p style="font-size:13px;color:#52525b;margin:0 0 20px;">
        Bonjour ${escapeHtml(recipientName)},<br>
        Vous trouverez ci-dessous le récapitulatif de la facture associée au dossier <strong>${escapeHtml(inv.dossier?.reference ?? '')}</strong>.
      </p>
      <table style="width:100%;border-collapse:collapse;border-top:1px solid #f4f4f5;">
        <tr><td style="padding:8px 0;font-size:12px;color:#71717a;">Sous-total HT</td><td style="padding:8px 0;font-size:13px;text-align:right;">${fmt(inv.subtotal_cents)}</td></tr>
        <tr><td style="padding:8px 0;font-size:12px;color:#71717a;">TVA</td><td style="padding:8px 0;font-size:13px;text-align:right;">${fmt(inv.vat_cents)}</td></tr>
        <tr style="border-top:1px solid #f4f4f5;"><td style="padding:12px 0 0;font-size:13px;font-weight:600;">Total TTC</td><td style="padding:12px 0 0;font-size:15px;font-weight:600;text-align:right;color:#7c3aed;">${fmt(inv.total_cents)}</td></tr>
      </table>
      ${inv.due_at ? `<p style="font-size:12px;color:#71717a;margin:20px 0 0;">Échéance de paiement : <strong style="color:#18181b;">${new Date(inv.due_at).toLocaleDateString('fr-FR')}</strong></p>` : ''}
    </div>
  </div>
</body></html>`;

  const result = await sendEmail({ to: recipientEmail, subject, html });
  if (!result.ok) {
    return { ok: false, error: result.reason };
  }
  return { ok: true };
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
