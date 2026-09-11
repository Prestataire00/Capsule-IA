'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { supabaseAdmin } from '@/shared/lib/supabase/admin';
import { sendEmail } from '@/shared/lib/email/resend';
import { getCurrentMember } from '@/shared/lib/auth/current-member';
import { can } from '@/shared/lib/auth/permissions';
import {
  buildBillingPlan,
  canBill,
  type FunderAllocationInput,
  type InvoiceInput,
  type Payer,
} from '@/features/billing/domain/billing-plan';
import { DEFAULT_PAYMENT_DAYS, PAYMENT_METHODS, settlementStatus } from '@/features/billing/domain/payments';
import { addDays } from '@/features/billing/domain/quote';
import {
  PROVISIONAL_PREFIX,
  assignFinalInvoiceNumber,
  isProvisionalReference,
  nextDocumentNumber,
} from '@/features/billing/quotes/quote-service';
import { buildInvoicePdf, loadInvoiceHeader } from '@/features/billing/invoices/invoice-pdf';
import { createCreditNote, creditedCents } from '@/features/billing/invoices/credit-notes';
import { sendInvoiceReminder } from '@/features/billing/invoices/reminders';

const admin = () => supabaseAdmin() as unknown as SupabaseClient;

const todayParis = (): string => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' }).format(new Date());

// Les Server Actions ne passent pas par le middleware : chaque action vérifie
// le droit « facturation / gérer » et borne tout à l'organisme du membre.
async function billingManager(): Promise<{ organizationId: string } | null> {
  const me = await getCurrentMember();
  if (!me || can(me.role, 'billing') !== 'manage') return null;
  return { organizationId: me.organizationId };
}

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

const provisionalReference = (): string =>
  `${PROVISIONAL_PREFIX}${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

/**
 * Émet une facture : numéro définitif FAC-AAAA-NNN (continu, attribué à
 * l'émission et jamais au brouillon), date d'émission et échéance par défaut.
 */
async function issue(
  sb: SupabaseClient,
  inv: { id: string; issued_at: string | null; due_at: string | null },
): Promise<boolean> {
  const reference = await assignFinalInvoiceNumber(sb, inv.id);
  if (!reference) return false;
  const issuedAt = inv.issued_at ?? todayParis();
  const { error } = await sb
    .schema('app')
    .from('invoices')
    .update({
      issued_at: issuedAt,
      due_at: inv.due_at ?? addDays(issuedAt, DEFAULT_PAYMENT_DAYS),
      updated_at: new Date().toISOString(),
    } as never)
    .eq('id', inv.id);
  return !error;
}

export async function createInvoice(formData: FormData): Promise<void> {
  const me = await billingManager();
  if (!me) redirect('/factures/nouvelle?error=forbidden');

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
      .eq('organization_id', me.organizationId)
      .maybeSingle(),
    sb
      .schema('app')
      .from('dossier_funders')
      .select('funder_id, amount_cents, status, funder:funders(name, kind)')
      .eq('dossier_id', data.dossierId),
    sb
      .schema('app')
      .from('invoices')
      .select('funder_id, subtotal_cents, status, kind')
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
    (invoiceRows ?? []) as unknown as Array<{ funder_id: string | null; subtotal_cents: number; status: string; kind: string }>
  ).map((i) => ({ funderId: i.funder_id, subtotalHtCents: i.subtotal_cents, status: i.status, kind: i.kind }));

  const plan = buildBillingPlan(dossier.total_amount_cents ?? 0, allocations, existingInvoices);
  const guard = canBill(plan, payer, subtotalCents);
  if (!guard.ok) {
    redirect(`/factures/nouvelle?error=${guard.error}&dossierId=${data.dossierId}&payer=${data.funderId || 'reste'}`);
  }

  // Numéro définitif seulement à l'émission : un brouillon porte un numéro provisoire.
  const reference = data.issuedNow ? await nextDocumentNumber(sb, dossier.organization_id, 'FAC') : provisionalReference();
  if (!reference) redirect('/factures/nouvelle?error=db');
  const issuedAt = data.issuedNow ? todayParis() : null;

  const { data: invoiceRow, error: insertErr } = await sb
    .schema('app')
    .from('invoices')
    .insert({
      organization_id: dossier.organization_id,
      reference,
      dossier_id: data.dossierId,
      funder_id: payer,
      company_id: dossier.company_id,
      status: data.issuedNow ? 'issued' : 'draft',
      issued_at: issuedAt,
      due_at: data.dueAt || (issuedAt ? addDays(issuedAt, DEFAULT_PAYMENT_DAYS) : null),
      subtotal_cents: subtotalCents,
      vat_cents: vatCents,
      total_cents: totalCents,
      currency: 'EUR',
    } as never)
    .select('id')
    .single();

  if (insertErr || !invoiceRow) {
    console.error('[createInvoice] insert failed', insertErr);
    redirect('/factures/nouvelle?error=db');
  }

  const invoiceId = (invoiceRow as { id: string }).id;

  const { error: lineErr } = await sb.schema('app').from('invoice_lines').insert({
    organization_id: dossier.organization_id,
    invoice_id: invoiceId,
    position: 0,
    description: data.description,
    quantity: data.quantity,
    unit_amount_cents: unitAmountCents,
    vat_rate: data.vatRate,
  } as never);
  if (lineErr) console.error('[createInvoice] ligne non créée', invoiceId, lineErr);

  revalidatePath('/factures');
  redirect(`/factures?created=${invoiceId}`);
}

export type SendInvoiceResult = { ok: true } | { ok: false; error: string };

const escapeHtml = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const money = (cents: number, currency: string) =>
  new Intl.NumberFormat('fr-FR', { style: 'currency', currency }).format(cents / 100);

/**
 * Envoie la facture (ou l'avoir) au payeur — financeur, responsable de
 * l'entreprise ou particulier —, PDF en pièce jointe. Un brouillon est d'abord
 * émis (numéro définitif) : on n'adresse jamais un brouillon à un client.
 */
export async function sendInvoiceByEmail(invoiceId: string): Promise<SendInvoiceResult> {
  const me = await billingManager();
  if (!me) return { ok: false, error: 'forbidden' };
  const sb = admin();

  const header = await loadInvoiceHeader(sb, invoiceId, me.organizationId);
  if (!header) return { ok: false, error: 'invoice_not_found' };
  if (header.status === 'cancelled') return { ok: false, error: 'cancelled' };
  if (header.status === 'draft') {
    if (!(await issue(sb, header))) return { ok: false, error: 'numbering_failed' };
    await sb.schema('app').from('invoices').update({ status: 'issued' } as never).eq('id', invoiceId);
  }

  const pdf = await buildInvoicePdf(sb, invoiceId, me.organizationId, { persist: true });
  if (!pdf) return { ok: false, error: 'invoice_not_found' };
  const inv = pdf.header;
  if (!pdf.recipient.email) return { ok: false, error: 'no_recipient_email' };

  const label = inv.kind === 'credit_note' ? 'Avoir' : inv.kind === 'deposit' ? "Facture d'acompte" : 'Facture';
  const greeting = pdf.recipient.attention ?? pdf.recipient.name;
  const html = `<!DOCTYPE html><html><body style="font-family:-apple-system,sans-serif;color:#18181b;line-height:1.55;background:#fafafa;margin:0;padding:24px;">
  <div style="max-width:580px;margin:0 auto;">
    <div style="background:white;border:1px solid #e4e4e7;border-radius:12px;padding:32px;">
      <p style="font-size:11px;text-transform:uppercase;letter-spacing:0.08em;color:#f97316;font-weight:600;margin:0 0 8px;">${label}</p>
      <h1 style="font-size:20px;font-weight:600;margin:0 0 16px;">${escapeHtml(inv.reference)}</h1>
      <p style="font-size:13px;color:#52525b;margin:0 0 20px;">
        Bonjour ${escapeHtml(greeting)},<br>
        Veuillez trouver ci-joint ${inv.kind === 'credit_note' ? "l'avoir" : 'la facture'} ${escapeHtml(inv.reference)}${pdf.recipient.attention ? ` adressé${inv.kind === 'credit_note' ? '' : 'e'} à ${escapeHtml(pdf.recipient.name)}` : ''}.
      </p>
      <table style="width:100%;border-collapse:collapse;border-top:1px solid #f4f4f5;">
        <tr><td style="padding:8px 0;font-size:12px;color:#71717a;">Total HT</td><td style="padding:8px 0;font-size:13px;text-align:right;">${money(inv.subtotal_cents, inv.currency)}</td></tr>
        <tr><td style="padding:8px 0;font-size:12px;color:#71717a;">TVA</td><td style="padding:8px 0;font-size:13px;text-align:right;">${money(inv.vat_cents, inv.currency)}</td></tr>
        <tr style="border-top:1px solid #f4f4f5;"><td style="padding:12px 0 0;font-size:13px;font-weight:600;">${inv.kind === 'credit_note' ? 'Montant de l’avoir' : 'Total à régler'}</td><td style="padding:12px 0 0;font-size:15px;font-weight:600;text-align:right;">${money(inv.total_cents, inv.currency)}</td></tr>
      </table>
      ${inv.due_at && inv.kind !== 'credit_note' ? `<p style="font-size:12px;color:#71717a;margin:20px 0 0;">À régler avant le <strong style="color:#18181b;">${new Date(`${inv.due_at}T12:00:00Z`).toLocaleDateString('fr-FR')}</strong>.</p>` : ''}
    </div>
  </div>
</body></html>`;

  const result = await sendEmail({
    to: pdf.recipient.email,
    subject: `${label} ${inv.reference} — ${money(inv.total_cents, inv.currency)}`,
    html,
    attachments: [{ filename: `${inv.kind === 'credit_note' ? 'avoir' : 'facture'}-${inv.reference}.pdf`, content: Buffer.from(pdf.bytes).toString('base64') }],
    organizationId: me.organizationId,
    dossierId: inv.dossier_id ?? undefined,
    kind: 'invoice_sent',
    metadata: { invoice_id: inv.id },
  });
  if (!result.ok) return { ok: false, error: result.reason };

  revalidatePath('/factures');
  return { ok: true };
}

// ── Statut, règlements, avoirs, relances ────────────────────────────────────

export type InvoiceStatusValue = 'draft' | 'issued' | 'paid' | 'partially_paid' | 'overdue' | 'cancelled';

export type InvoiceMutationResult = { ok: true } | { ok: false; error: string };

/**
 * Change le statut d'une facture. Toute sortie du brouillon (hors annulation)
 * l'émet : numéro définitif, date d'émission, échéance. Une facture émise ne
 * redevient jamais brouillon (numérotation continue) — on émet un avoir.
 */
export async function setInvoiceStatus(invoiceId: string, status: InvoiceStatusValue): Promise<InvoiceMutationResult> {
  const me = await billingManager();
  if (!me) return { ok: false, error: 'forbidden' };

  const sb = admin();
  const { data: row } = await sb
    .schema('app')
    .from('invoices')
    .select('id, reference, status, paid_at, issued_at, due_at')
    .eq('id', invoiceId)
    .eq('organization_id', me.organizationId)
    .is('deleted_at', null)
    .maybeSingle();
  const inv = row as {
    id: string;
    reference: string;
    status: string;
    paid_at: string | null;
    issued_at: string | null;
    due_at: string | null;
  } | null;
  if (!inv) return { ok: false, error: 'not_found' };

  if (status === 'draft' && !isProvisionalReference(inv.reference)) return { ok: false, error: 'already_issued' };
  if (status !== 'draft' && status !== 'cancelled' && isProvisionalReference(inv.reference)) {
    if (!(await issue(sb, inv))) return { ok: false, error: 'numbering_failed' };
  }

  const nowIso = new Date().toISOString();
  const { error } = await sb
    .schema('app')
    .from('invoices')
    .update({
      status,
      updated_at: nowIso,
      paid_at: status === 'paid' ? (inv.paid_at ?? nowIso) : null,
    } as never)
    .eq('id', invoiceId)
    .eq('organization_id', me.organizationId);
  if (error) return { ok: false, error: error.message };

  revalidatePath('/factures');
  return { ok: true };
}

const paymentSchema = z.object({
  invoiceId: z.string().uuid(),
  amountCents: z.number().int().positive().max(100_000_000),
  paidAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  method: z.enum(PAYMENT_METHODS),
  reference: z.string().trim().max(120).optional(),
});
export type RecordPaymentInput = z.infer<typeof paymentSchema>;

/**
 * Enregistre un règlement (acompte, solde, paiement OPCO…). Le statut suit la
 * somme encaissée (avoirs déduits) : partielle, puis payée quand le dû est soldé.
 */
export async function recordPayment(input: RecordPaymentInput): Promise<InvoiceMutationResult> {
  const me = await billingManager();
  if (!me) return { ok: false, error: 'forbidden' };
  const parsed = paymentSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'invalid' };

  const sb = admin();
  const header = await loadInvoiceHeader(sb, parsed.data.invoiceId, me.organizationId);
  if (!header) return { ok: false, error: 'not_found' };
  if (header.kind === 'credit_note') return { ok: false, error: 'is_credit_note' };
  if (header.status === 'draft') return { ok: false, error: 'not_issued' };
  if (header.status === 'cancelled') return { ok: false, error: 'cancelled' };

  const { error: insErr } = await sb
    .schema('app')
    .from('payments')
    .insert({
      organization_id: me.organizationId,
      invoice_id: header.id,
      amount_cents: parsed.data.amountCents,
      paid_at: `${parsed.data.paidAt}T12:00:00Z`,
      method: parsed.data.method,
      reference: parsed.data.reference || null,
    } as never);
  if (insErr) return { ok: false, error: insErr.message };

  const { data: paidRows } = await sb.schema('app').from('payments').select('amount_cents, paid_at').eq('invoice_id', header.id);
  const payments = (paidRows ?? []) as Array<{ amount_cents: number; paid_at: string }>;
  const paid = payments.reduce((s, p) => s + Number(p.amount_cents), 0);
  const due = Number(header.total_cents) - (await creditedCents(sb, header.id));
  const settled = settlementStatus(due, paid);
  const lastPaidAt = payments.map((p) => p.paid_at).sort().at(-1) ?? null;
  // Une facture échue partiellement réglée reste en retard tant qu'elle n'est pas soldée.
  const status = settled === 'paid' ? 'paid' : header.status === 'overdue' ? 'overdue' : settled;

  const { error } = await sb
    .schema('app')
    .from('invoices')
    .update({ status, paid_at: settled === 'paid' ? lastPaidAt : null, updated_at: new Date().toISOString() } as never)
    .eq('id', header.id);
  if (error) return { ok: false, error: error.message };

  revalidatePath('/factures');
  return { ok: true };
}

const creditNoteSchema = z.object({
  invoiceId: z.string().uuid(),
  /** TTC en centimes ; null = avoir total. */
  amountCents: z.number().int().positive().max(100_000_000).nullable(),
  reason: z.string().trim().max(300),
});

/** Émet un avoir (total ou partiel) sur une facture émise. */
export async function createCreditNoteAction(
  input: z.infer<typeof creditNoteSchema>,
): Promise<{ ok: true; reference: string } | { ok: false; error: string }> {
  const me = await billingManager();
  if (!me) return { ok: false, error: 'forbidden' };
  const parsed = creditNoteSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'invalid' };

  const r = await createCreditNote(admin(), parsed.data.invoiceId, me.organizationId, parsed.data.amountCents, parsed.data.reason);
  if (!r.ok) return { ok: false, error: r.error };
  revalidatePath('/factures');
  return { ok: true, reference: r.reference };
}

/** Relance de paiement manuelle (PDF joint) au payeur. */
export async function sendPaymentReminder(invoiceId: string): Promise<SendInvoiceResult> {
  const me = await billingManager();
  if (!me) return { ok: false, error: 'forbidden' };
  const r = await sendInvoiceReminder(admin(), invoiceId, me.organizationId);
  if (!r.ok) return r;
  revalidatePath('/factures');
  return { ok: true };
}

/** Active ou coupe les relances automatiques (paiement et signature des devis). */
export async function setAutoPaymentReminders(enabled: boolean): Promise<InvoiceMutationResult> {
  const me = await billingManager();
  if (!me) return { ok: false, error: 'forbidden' };
  const { error } = await admin()
    .schema('app')
    .from('organizations')
    .update({ auto_payment_reminders: enabled } as never)
    .eq('id', me.organizationId);
  if (error) return { ok: false, error: error.message };
  revalidatePath('/factures');
  return { ok: true };
}
