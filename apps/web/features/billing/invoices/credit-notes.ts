import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { creditableCents } from '../domain/invoice-kinds';
import { isProvisionalReference, nextDocumentNumber } from '../quotes/quote-service';
import { loadInvoiceHeader } from './invoice-pdf';

// Avoirs : une facture émise ne se modifie ni ne se supprime ; on l'annule en
// tout ou partie par un avoir (série AV-AAAA-NNN), qui reprend son payeur.
type Sb = SupabaseClient;

const todayParis = (): string => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' }).format(new Date());

export async function creditedCents(sb: Sb, invoiceId: string): Promise<number> {
  const { data } = await sb
    .schema('app')
    .from('invoices')
    .select('total_cents')
    .eq('related_invoice_id', invoiceId)
    .eq('kind', 'credit_note')
    .neq('status', 'cancelled')
    .is('deleted_at', null);
  return ((data ?? []) as Array<{ total_cents: number }>).reduce((s, r) => s + Number(r.total_cents), 0);
}

export type CreditNoteResult =
  | { ok: true; creditNoteId: string; reference: string; full: boolean }
  | { ok: false; error: 'not_found' | 'not_issued' | 'is_credit_note' | 'invalid_amount' | 'numbering_failed' | 'db' };

/**
 * Émet un avoir sur une facture émise. `amountCents` (TTC) null = avoir total :
 * la facture passe alors « annulée » (annulation comptable par avoir).
 */
export async function createCreditNote(
  sb: Sb,
  invoiceId: string,
  organizationId: string,
  amountCents: number | null,
  reason: string,
): Promise<CreditNoteResult> {
  const inv = await loadInvoiceHeader(sb, invoiceId, organizationId);
  if (!inv) return { ok: false, error: 'not_found' };
  if (inv.kind === 'credit_note') return { ok: false, error: 'is_credit_note' };
  if (inv.status === 'draft' || inv.status === 'cancelled' || isProvisionalReference(inv.reference)) {
    return { ok: false, error: 'not_issued' };
  }

  const max = creditableCents(Number(inv.total_cents), await creditedCents(sb, inv.id));
  const amount = amountCents ?? max;
  if (!(amount > 0) || amount > max) return { ok: false, error: 'invalid_amount' };

  const ratio = Number(inv.total_cents) > 0 ? amount / Number(inv.total_cents) : 0;
  const subtotal = Math.round(Number(inv.subtotal_cents) * ratio);
  const vat = amount - subtotal;
  const vatRate = subtotal > 0 ? Math.round((vat / subtotal) * 10_000) / 100 : 0;

  const reference = await nextDocumentNumber(sb, organizationId, 'AV');
  if (!reference) return { ok: false, error: 'numbering_failed' };

  const { data: row, error } = await sb
    .schema('app')
    .from('invoices')
    .insert({
      organization_id: organizationId,
      reference,
      kind: 'credit_note',
      related_invoice_id: inv.id,
      dossier_id: inv.dossier_id,
      funder_id: inv.funder_id,
      company_id: inv.company_id,
      quote_id: inv.quote_id,
      status: 'issued',
      issued_at: todayParis(),
      subtotal_cents: subtotal,
      vat_cents: vat,
      total_cents: amount,
      currency: inv.currency,
      payment_terms: 'Avoir à déduire de votre prochain règlement ou remboursé sur demande.',
      metadata: { reason, credited_invoice_reference: inv.reference },
    } as never)
    .select('id')
    .single();
  if (error || !row) return { ok: false, error: 'db' };
  const creditNoteId = (row as { id: string }).id;

  await sb
    .schema('app')
    .from('invoice_lines')
    .insert({
      organization_id: organizationId,
      invoice_id: creditNoteId,
      position: 0,
      description: `Avoir sur facture ${inv.reference}${reason ? ` — ${reason}` : ''}`,
      quantity: 1,
      unit_amount_cents: subtotal,
      vat_rate: vatRate,
    } as never);

  const full = amount === max && (await creditedCents(sb, inv.id)) >= Number(inv.total_cents);
  if (full) {
    await sb
      .schema('app')
      .from('invoices')
      .update({
        status: 'cancelled',
        metadata: { ...(inv.metadata ?? {}), cancelled_by_credit_note: reference },
        updated_at: new Date().toISOString(),
      } as never)
      .eq('id', inv.id);
  }
  return { ok: true, creditNoteId, reference, full };
}
