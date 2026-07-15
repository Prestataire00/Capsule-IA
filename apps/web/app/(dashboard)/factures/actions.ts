'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { env } from '@/env.mjs';
import { sendEmail } from '@/shared/lib/email/resend';
import { getCurrentMember } from '@/shared/lib/auth/current-member';
import {
  buildBillingPlan,
  canBill,
  type FunderAllocationInput,
  type InvoiceInput,
  type Payer,
} from '@/features/billing/domain/billing-plan';

const admin = () =>
  createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

const createInvoiceSchema = z.object({
  dossierId: z.string().uuid('Dossier requis'),
  // Payeur : un financeur (uuid) du dossier, ou '' = reste à charge (entreprise/apprenant).
  funderId: z.string().uuid().optional().or(z.literal('')),
  description: z.string().trim().min(3, 'Description trop courte').max(200),
  unitAmountEuros: z.coerce.number().min(0),
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
    funderId: formData.get('funderId') ?? '',
    description: formData.get('description'),
    unitAmountEuros: formData.get('unitAmountEuros'),
    quantity: formData.get('quantity') || '1',
    vatRate: formData.get('vatRate') || '20',
    dueAt: formData.get('dueAt'),
    issuedNow: formData.get('issuedNow') === 'on' ? 'true' : 'false',
  });

  if (!parsed.success) {
    redirect('/factures/nouvelle?error=invalid');
  }
  const data = parsed.data;
  const payer: Payer = data.funderId ? data.funderId : null;

  const sb = admin();

  // Charge le dossier (org, entreprise destinataire, total HT) + financeurs + factures existantes.
  const [{ data: dossierRow }, { data: funderRows }, { data: invoiceRows }] = await Promise.all([
    sb
      .schema('app')
      .from('dossiers')
      .select('organization_id, company_id, total_amount_cents')
      .eq('id', data.dossierId)
      .maybeSingle(),
    sb
      .schema('app')
      .from('dossier_funders')
      .select('funder_id, amount_cents, status, funder:funders(name, kind)')
      .eq('dossier_id', data.dossierId),
    sb
      .schema('app')
      .from('invoices')
      .select('funder_id, subtotal_cents, status')
      .eq('dossier_id', data.dossierId)
      .is('deleted_at', null),
  ]);

  if (!dossierRow) {
    redirect('/factures/nouvelle?error=dossier_not_found');
  }
  const dossier = dossierRow as {
    organization_id: string;
    company_id: string | null;
    total_amount_cents: number | null;
  };

  const unitAmountCents = Math.round(data.unitAmountEuros * 100);
  const subtotalCents = Math.round(unitAmountCents * data.quantity);
  const vatCents = Math.round(subtotalCents * (data.vatRate / 100));
  const totalCents = subtotalCents + vatCents;

  // Garde anti-double-facturation : Σ factures ≤ total dossier, et par payeur ≤ son allocation.
  const allocations: FunderAllocationInput[] = (
    (funderRows ?? []) as unknown as Array<{
      funder_id: string;
      amount_cents: number;
      status: string;
      funder: { name: string; kind: string } | null;
    }>
  ).map((f) => ({
    funderId: f.funder_id,
    name: f.funder?.name ?? 'Financeur',
    kind: f.funder?.kind ?? 'autre',
    allocatedHtCents: f.amount_cents,
    status: (f.status as FunderAllocationInput['status']) ?? 'pending',
  }));
  const existingInvoices: InvoiceInput[] = (
    (invoiceRows ?? []) as unknown as Array<{ funder_id: string | null; subtotal_cents: number; status: string }>
  ).map((i) => ({ funderId: i.funder_id, subtotalHtCents: i.subtotal_cents, status: i.status }));

  const plan = buildBillingPlan(dossier.total_amount_cents ?? 0, allocations, existingInvoices);
  const guard = canBill(plan, payer, subtotalCents);
  if (!guard.ok) {
    redirect(`/factures/nouvelle?error=${guard.error}&dossierId=${data.dossierId}&payer=${data.funderId || 'reste'}`);
  }

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
      funder_id: payer,
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
    unit_amount_cents: unitAmountCents,
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
  const pdfUrl = env.PUBLIC_APP_URL
    ? `${env.PUBLIC_APP_URL.replace(/\/$/, '')}/api/invoices/${inv.id}/facture.pdf`
    : null;

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
      ${pdfUrl ? `<div style="margin-top:24px;text-align:center;"><a href="${pdfUrl}" style="display:inline-block;padding:12px 24px;background:#7c3aed;color:white;text-decoration:none;border-radius:8px;font-size:13px;font-weight:500;">📎 Télécharger la facture PDF</a></div>` : ''}
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

// ── Statut & relance ────────────────────────────────────────────────────────
// Rôles autorisés à gérer la facturation (aligné sur la RLS invoices).
const BILLING_ROLES = ['owner', 'admin', 'comptable'];

export type InvoiceStatusValue =
  | 'draft'
  | 'issued'
  | 'paid'
  | 'partially_paid'
  | 'overdue'
  | 'cancelled';

export type InvoiceMutationResult = { ok: true } | { ok: false; error: string };

/**
 * Change le statut d'une facture (payée / non payée / en retard / annulée…).
 * Service_role => on scope explicitement à l'org du membre connecté et on
 * contrôle le rôle (owner/admin/comptable). Synchronise `paid_at` avec le statut.
 */
export async function setInvoiceStatus(
  invoiceId: string,
  status: InvoiceStatusValue,
): Promise<InvoiceMutationResult> {
  const me = await getCurrentMember();
  if (!me || !BILLING_ROLES.includes(me.role)) return { ok: false, error: 'forbidden' };

  const sb = admin();
  const { data: row } = await sb
    .schema('app')
    .from('invoices')
    .select('id, organization_id, paid_at')
    .eq('id', invoiceId)
    .eq('organization_id', me.organizationId)
    .is('deleted_at', null)
    .maybeSingle();
  if (!row) return { ok: false, error: 'not_found' };

  const nowIso = new Date().toISOString();
  const patch: Record<string, unknown> = { status, updated_at: nowIso };
  // paid_at cohérent : renseigné si payée, effacé sinon.
  patch.paid_at =
    status === 'paid' ? (row as { paid_at: string | null }).paid_at ?? nowIso : null;

  const { error } = await sb
    .schema('app')
    .from('invoices')
    .update(patch as never)
    .eq('id', invoiceId)
    .eq('organization_id', me.organizationId);
  if (error) return { ok: false, error: error.message };

  revalidatePath('/factures');
  return { ok: true };
}

/**
 * Émet une relance de paiement par email (ton « relance ») et trace la relance
 * dans metadata (last_reminder_at + reminder_count).
 */
export async function sendPaymentReminder(invoiceId: string): Promise<SendInvoiceResult> {
  const me = await getCurrentMember();
  if (!me || !BILLING_ROLES.includes(me.role)) return { ok: false, error: 'forbidden' };

  const sb = admin();
  const { data: invRow } = await sb
    .schema('app')
    .from('invoices')
    .select(`
      id, reference, status, total_cents, currency, issued_at, due_at, metadata,
      dossier:dossiers(reference, learner:learners(first_name, last_name, email)),
      company:companies(name, contact_email)
    `)
    .eq('id', invoiceId)
    .eq('organization_id', me.organizationId)
    .maybeSingle();
  if (!invRow) return { ok: false, error: 'invoice_not_found' };

  const inv = invRow as unknown as {
    id: string;
    reference: string;
    status: string;
    total_cents: number;
    currency: string;
    issued_at: string | null;
    due_at: string | null;
    metadata: Record<string, unknown> | null;
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
  const dueLabel = inv.due_at ? new Date(inv.due_at).toLocaleDateString('fr-FR') : null;
  const overdue = inv.due_at ? new Date(inv.due_at) < new Date() : false;

  const subject = `Relance — facture ${inv.reference} (${fmt(inv.total_cents)})`;
  const pdfUrl = env.PUBLIC_APP_URL
    ? `${env.PUBLIC_APP_URL.replace(/\/$/, '')}/api/invoices/${inv.id}/facture.pdf`
    : null;

  const html = `<!DOCTYPE html><html><body style="font-family:-apple-system,sans-serif;color:#18181b;line-height:1.55;background:#fafafa;margin:0;padding:24px;">
  <div style="max-width:580px;margin:0 auto;">
    <div style="background:white;border:1px solid #e4e4e7;border-radius:12px;padding:32px;">
      <p style="font-size:11px;text-transform:uppercase;letter-spacing:0.08em;color:#d97706;font-weight:600;margin:0 0 8px;">Relance de paiement</p>
      <h1 style="font-size:20px;font-weight:600;margin:0 0 16px;">Facture ${escapeHtml(inv.reference)}</h1>
      <p style="font-size:13px;color:#52525b;margin:0 0 20px;">
        Bonjour ${escapeHtml(recipientName)},<br>
        Sauf erreur de notre part, la facture <strong>${escapeHtml(inv.reference)}</strong> d'un montant de
        <strong>${fmt(inv.total_cents)}</strong> demeure impayée à ce jour.
        ${dueLabel ? `Son échéance ${overdue ? 'était fixée' : 'est fixée'} au <strong>${dueLabel}</strong>.` : ''}
        Nous vous remercions de bien vouloir procéder à son règlement dans les meilleurs délais.
      </p>
      ${pdfUrl ? `<div style="margin-top:8px;text-align:center;"><a href="${pdfUrl}" style="display:inline-block;padding:12px 24px;background:#d97706;color:white;text-decoration:none;border-radius:8px;font-size:13px;font-weight:500;">📎 Revoir la facture</a></div>` : ''}
      <p style="font-size:12px;color:#a1a1aa;margin:24px 0 0;">Si le règlement a déjà été effectué, merci de ne pas tenir compte de ce message.</p>
    </div>
  </div>
</body></html>`;

  const result = await sendEmail({ to: recipientEmail, subject, html });
  if (!result.ok) return { ok: false, error: result.reason };

  // Trace la relance (date + compteur) dans metadata.
  const meta = (inv.metadata ?? {}) as Record<string, unknown>;
  const count = typeof meta.reminder_count === 'number' ? meta.reminder_count : 0;
  const nowIso = new Date().toISOString();
  await sb
    .schema('app')
    .from('invoices')
    .update({ metadata: { ...meta, last_reminder_at: nowIso, reminder_count: count + 1 }, updated_at: nowIso } as never)
    .eq('id', inv.id)
    .eq('organization_id', me.organizationId);

  revalidatePath('/factures');
  return { ok: true };
}
