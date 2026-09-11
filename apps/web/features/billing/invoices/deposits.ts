import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { balanceAmounts, checkDeposit, depositAmounts, type DepositError } from '../domain/invoice-kinds';
import { PROVISIONAL_PREFIX } from '../quotes/quote-service';

// Facturation d'un devis signé en plusieurs fois : acompte(s), puis solde.
// La facture brouillon créée à la signature devient la facture de solde
// (devis − acomptes) tant qu'elle n'est pas émise. Client service_role :
// l'organisme est vérifié par l'appelant et rappelé dans chaque requête.
type Sb = SupabaseClient;

type QuoteForBilling = {
  id: string;
  organization_id: string;
  reference: string;
  status: string;
  client_kind: 'company' | 'individual';
  company_id: string | null;
  object: string;
  subtotal_cents: number;
  vat_cents: number;
  total_cents: number;
  vat_rate: number;
  currency: string;
};

type InvoiceLite = { id: string; kind: string; status: string; subtotal_cents: number; vat_cents: number; total_cents: number };

const euros = (cents: number): string =>
  new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(cents / 100);

async function loadQuote(sb: Sb, quoteId: string, organizationId: string): Promise<QuoteForBilling | null> {
  const { data } = await sb
    .schema('app')
    .from('quotes')
    .select('id, organization_id, reference, status, client_kind, company_id, object, subtotal_cents, vat_cents, total_cents, vat_rate, currency')
    .eq('id', quoteId)
    .eq('organization_id', organizationId)
    .is('deleted_at', null)
    .maybeSingle();
  return (data as unknown as QuoteForBilling | null) ?? null;
}

async function quoteInvoices(sb: Sb, quoteId: string): Promise<InvoiceLite[]> {
  const { data } = await sb
    .schema('app')
    .from('invoices')
    .select('id, kind, status, subtotal_cents, vat_cents, total_cents')
    .eq('quote_id', quoteId)
    .neq('status', 'cancelled')
    .is('deleted_at', null);
  return (data ?? []) as unknown as InvoiceLite[];
}

const amountsOf = (i: InvoiceLite) => ({
  subtotalCents: Number(i.subtotal_cents),
  vatCents: Number(i.vat_cents),
  totalCents: Number(i.total_cents),
});

export type DepositResult =
  | { ok: true; invoiceId: string }
  | { ok: false; error: DepositError | 'not_found' | 'not_signed' | 'already_invoiced' | 'db' };

/**
 * Facture d'acompte sur un devis signé (brouillon, numéro à l'émission). Le
 * particulier est plafonné à 30 % (art. L.6353-6). Impossible une fois la
 * facture totale ou de solde émise.
 */
export async function createDepositInvoice(
  sb: Sb,
  quoteId: string,
  organizationId: string,
  percent: number,
): Promise<DepositResult> {
  const quote = await loadQuote(sb, quoteId, organizationId);
  if (!quote) return { ok: false, error: 'not_found' };
  if (quote.status !== 'signed') return { ok: false, error: 'not_signed' };

  const invoices = await quoteInvoices(sb, quoteId);
  if (invoices.some((i) => (i.kind === 'invoice' || i.kind === 'balance') && i.status !== 'draft')) {
    return { ok: false, error: 'already_invoiced' };
  }
  const deposits = invoices.filter((i) => i.kind === 'deposit');
  const depositedPercent =
    quote.subtotal_cents > 0
      ? (deposits.reduce((s, d) => s + Number(d.subtotal_cents), 0) / Number(quote.subtotal_cents)) * 100
      : 0;
  const check = checkDeposit(percent, quote.client_kind, depositedPercent);
  if (check) return { ok: false, error: check };

  const amounts = depositAmounts(
    { subtotalCents: Number(quote.subtotal_cents), vatCents: Number(quote.vat_cents), totalCents: Number(quote.total_cents) },
    percent,
  );
  const { data: links } = await sb.schema('app').from('quote_dossiers').select('dossier_id').eq('quote_id', quoteId);
  const dossierId = ((links ?? []) as Array<{ dossier_id: string }>)[0]?.dossier_id ?? null;

  const { data: inv, error } = await sb
    .schema('app')
    .from('invoices')
    .insert({
      organization_id: organizationId,
      reference: `${PROVISIONAL_PREFIX}ACPT-${quote.reference}-${Date.now().toString(36).toUpperCase()}`,
      kind: 'deposit',
      dossier_id: dossierId,
      company_id: quote.company_id,
      quote_id: quoteId,
      status: 'draft',
      subtotal_cents: amounts.subtotalCents,
      vat_cents: amounts.vatCents,
      total_cents: amounts.totalCents,
      currency: quote.currency,
      payment_terms: 'Acompte payable à réception de la facture.',
      metadata: { deposit_percent: percent, quote_reference: quote.reference },
    } as never)
    .select('id')
    .single();
  if (error || !inv) return { ok: false, error: 'db' };
  const invoiceId = (inv as { id: string }).id;

  const { error: lErr } = await sb
    .schema('app')
    .from('invoice_lines')
    .insert({
      organization_id: organizationId,
      invoice_id: invoiceId,
      position: 0,
      description: `Acompte de ${percent} % — devis ${quote.reference} (${quote.object})`,
      quantity: 1,
      unit_amount_cents: amounts.subtotalCents,
      vat_rate: Number(quote.vat_rate),
    } as never);
  if (lErr) console.error('[acompte] ligne non créée', invoiceId, lErr);

  await syncBalanceInvoice(sb, quoteId, organizationId);
  return { ok: true, invoiceId };
}

/**
 * Recalcule la facture brouillon du devis en facture de solde : total du devis
 * moins les acomptes facturés (non annulés). Sans acompte, elle reste la
 * facture totale. Une facture déjà émise n'est jamais modifiée.
 */
export async function syncBalanceInvoice(sb: Sb, quoteId: string, organizationId: string): Promise<void> {
  const quote = await loadQuote(sb, quoteId, organizationId);
  if (!quote) return;
  const invoices = await quoteInvoices(sb, quoteId);
  const target = invoices.find((i) => (i.kind === 'invoice' || i.kind === 'balance') && i.status === 'draft');
  if (!target) return;
  const deposits = invoices.filter((i) => i.kind === 'deposit').map(amountsOf);
  if (deposits.length === 0) return;

  const quoteAmounts = {
    subtotalCents: Number(quote.subtotal_cents),
    vatCents: Number(quote.vat_cents),
    totalCents: Number(quote.total_cents),
  };
  const balance = balanceAmounts(quoteAmounts, deposits);
  const deposited = deposits.reduce((s, d) => s + d.subtotalCents, 0);

  const { error } = await sb
    .schema('app')
    .from('invoices')
    .update({
      kind: 'balance',
      subtotal_cents: balance.subtotalCents,
      vat_cents: balance.vatCents,
      total_cents: balance.totalCents,
      updated_at: new Date().toISOString(),
    } as never)
    .eq('id', target.id)
    .eq('status', 'draft');
  if (error) {
    console.error('[solde] facture non recalculée', target.id, error);
    return;
  }
  await sb.schema('app').from('invoice_lines').delete().eq('invoice_id', target.id);
  await sb
    .schema('app')
    .from('invoice_lines')
    .insert({
      organization_id: organizationId,
      invoice_id: target.id,
      position: 0,
      description: `Solde — devis ${quote.reference} : total ${euros(quoteAmounts.subtotalCents)} HT, acomptes déduits ${euros(deposited)} HT`,
      quantity: 1,
      unit_amount_cents: balance.subtotalCents,
      vat_rate: Number(quote.vat_rate),
    } as never);
}
