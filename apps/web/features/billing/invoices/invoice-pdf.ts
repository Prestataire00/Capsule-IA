import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { generateInvoicePDF, type InvoiceInput } from '@/features/documents/generate-invoice-pdf';
import { loadOrgBranding } from '@/features/documents/load-org-branding';
import { persistGeneratedDocument } from '@/features/documents/persist-document';
import { isProvisionalReference } from '@/features/billing/quotes/quote-service';

// Rendu et destinataire d'une facture, partagés par le téléchargement et les
// envois (facture, relance). Client service_role : l'appelant fournit
// l'organisme du membre connecté, qui borne toutes les lectures.
type Sb = SupabaseClient;

type AddressJson = { line1?: string; line2?: string; city?: string; postal_code?: string; country?: string };

function composeAddress(addr: unknown): string | null {
  if (!addr || typeof addr !== 'object') return typeof addr === 'string' && addr.trim() ? addr : null;
  const a = addr as AddressJson;
  const parts = [
    [a.line1, a.line2].filter(Boolean).join(' '),
    [a.postal_code, a.city].filter(Boolean).join(' '),
    a.country,
  ].filter((p) => p && p.trim().length > 0);
  return parts.length ? parts.join(', ') : null;
}

export type InvoiceRecipient = {
  name: string;
  email: string | null;
  siret: string | null;
  address: string | null;
  /** Personne à l'attention de qui la facture est adressée (responsable entreprise). */
  attention: string | null;
};

type InvoiceParties = {
  funder_id: string | null;
  company_id: string | null;
  dossier_id: string | null;
  quote_id: string | null;
};

/**
 * Qui paie, donc qui reçoit la facture (règle RFC) : le financeur facturé en
 * subrogation ; sinon l'entreprise cliente, à l'attention de son responsable
 * (jamais le salarié) ; sinon le particulier lui-même.
 */
export async function resolveInvoiceRecipient(sb: Sb, inv: InvoiceParties): Promise<InvoiceRecipient> {
  if (inv.funder_id) {
    const { data } = await sb
      .schema('app')
      .from('funders')
      .select('name, contact_email, address')
      .eq('id', inv.funder_id)
      .maybeSingle();
    const f = data as { name: string; contact_email: string | null; address: unknown } | null;
    if (f) return { name: f.name, email: f.contact_email, siret: null, address: composeAddress(f.address), attention: null };
  }

  const { data: quoteRow } = inv.quote_id
    ? await sb.schema('app').from('quotes').select('recipient_name, recipient_email').eq('id', inv.quote_id).maybeSingle()
    : { data: null };
  const quote = quoteRow as { recipient_name: string | null; recipient_email: string | null } | null;

  if (inv.company_id) {
    const { data } = await sb
      .schema('app')
      .from('companies')
      .select('name, siret, address, contact_name, contact_email')
      .eq('id', inv.company_id)
      .maybeSingle();
    const c = data as {
      name: string;
      siret: string | null;
      address: unknown;
      contact_name: string | null;
      contact_email: string | null;
    } | null;
    if (c) {
      return {
        name: c.name,
        email: quote?.recipient_email ?? c.contact_email,
        siret: c.siret,
        address: composeAddress(c.address),
        attention: quote?.recipient_name ?? c.contact_name,
      };
    }
  }

  const { data: dRow } = inv.dossier_id
    ? await sb
        .schema('app')
        .from('dossiers')
        .select('learner:learners(first_name, last_name, email, address)')
        .eq('id', inv.dossier_id)
        .maybeSingle()
    : { data: null };
  const learner = (dRow as { learner: { first_name: string; last_name: string; email: string | null; address: unknown } | null } | null)
    ?.learner;
  return {
    name: learner ? `${learner.first_name} ${learner.last_name}`.trim() : (quote?.recipient_name ?? 'Destinataire'),
    email: quote?.recipient_email ?? learner?.email ?? null,
    siret: null,
    address: composeAddress(learner?.address),
    attention: null,
  };
}

export type InvoiceHeader = {
  id: string;
  reference: string;
  status: string;
  issued_at: string | null;
  due_at: string | null;
  payment_terms: string | null;
  subtotal_cents: number;
  vat_cents: number;
  total_cents: number;
  currency: string;
  organization_id: string;
  metadata: Record<string, unknown> | null;
  kind: string;
  related_invoice_id: string | null;
} & InvoiceParties;

export async function loadInvoiceHeader(sb: Sb, invoiceId: string, organizationId: string): Promise<InvoiceHeader | null> {
  const { data } = await sb
    .schema('app')
    .from('invoices')
    .select(
      'id, reference, status, issued_at, due_at, payment_terms, subtotal_cents, vat_cents, total_cents, currency, ' +
        'organization_id, funder_id, company_id, dossier_id, quote_id, metadata, kind, related_invoice_id',
    )
    .eq('id', invoiceId)
    .eq('organization_id', organizationId)
    .is('deleted_at', null)
    .maybeSingle();
  return (data as unknown as InvoiceHeader | null) ?? null;
}

/** PDF de la facture (et, si demandé, archivage dans les documents du dossier). */
export async function buildInvoicePdf(
  sb: Sb,
  invoiceId: string,
  organizationId: string,
  opts: { persist?: boolean } = {},
): Promise<{ bytes: Uint8Array; reference: string; header: InvoiceHeader; recipient: InvoiceRecipient } | null> {
  const inv = await loadInvoiceHeader(sb, invoiceId, organizationId);
  if (!inv) return null;

  const [{ data: orgRow }, { data: linesRows }, { data: dossierRow }, { data: quoteRow }, recipient, branding, { data: relatedRow }] =
    await Promise.all([
      sb
        .schema('app')
        .from('organizations')
        .select('name, siret, declaration_activite, address, contact_email, contact_phone, certifications')
        .eq('id', inv.organization_id)
        .maybeSingle(),
      sb
        .schema('app')
        .from('invoice_lines')
        .select('description, quantity, unit_amount_cents, vat_rate, position')
        .eq('invoice_id', inv.id)
        .order('position', { ascending: true }),
      inv.dossier_id
        ? sb.schema('app').from('dossiers').select('reference').eq('id', inv.dossier_id).maybeSingle()
        : Promise.resolve({ data: null }),
      inv.quote_id
        ? sb.schema('app').from('quotes').select('reference').eq('id', inv.quote_id).maybeSingle()
        : Promise.resolve({ data: null }),
      resolveInvoiceRecipient(sb, inv),
      loadOrgBranding(sb as never, inv.organization_id),
      inv.related_invoice_id
        ? sb.schema('app').from('invoices').select('reference').eq('id', inv.related_invoice_id).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

  const org = orgRow as {
    name: string;
    siret: string | null;
    declaration_activite: string | null;
    address: AddressJson | null;
    contact_email: string | null;
    contact_phone: string | null;
  } | null;
  const lines = (linesRows ?? []) as Array<{ description: string; quantity: number; unit_amount_cents: number; vat_rate: number }>;
  const dossierRef = (dossierRow as { reference?: string } | null)?.reference ?? null;
  const quoteRef = (quoteRow as { reference?: string } | null)?.reference ?? null;

  const input: InvoiceInput = {
    organization: {
      name: org?.name ?? 'Organisme de formation',
      siret: org?.siret ?? null,
      nda: org?.declaration_activite ?? null,
      address: composeAddress(org?.address),
      contactEmail: org?.contact_email ?? null,
      contactPhone: org?.contact_phone ?? null,
      certifications: (org as { certifications?: string | null } | null)?.certifications ?? null,
    },
    recipient: {
      name: recipient.name,
      siret: recipient.siret,
      address: recipient.address,
      attention: recipient.attention,
    },
    signaturePng: branding.signaturePng,
    stampPng: branding.stampPng,
    logoPng: branding.logoPng,
    representativeName: branding.representativeName ?? org?.contact_email ?? null,
    representativeTitle: branding.representativeTitle,
    place: org?.address?.city ?? null,
    invoice: {
      reference: isProvisionalReference(inv.reference) ? 'BROUILLON — non émise' : inv.reference,
      issuedAt: inv.issued_at,
      dueAt: inv.due_at,
      status: inv.status,
      subtotalCents: inv.subtotal_cents,
      vatCents: inv.vat_cents,
      totalCents: inv.total_cents,
      currency: inv.currency,
      paymentTerms: inv.payment_terms,
      dossierReference: [dossierRef, quoteRef ? `devis ${quoteRef}` : null].filter(Boolean).join(' · ') || null,
      kind: inv.kind,
      relatedReference: (relatedRow as { reference?: string } | null)?.reference ?? null,
    },
    lines: lines.map((l) => ({
      description: l.description,
      quantity: Number(l.quantity),
      unitAmountCents: l.unit_amount_cents,
      vatRate: Number(l.vat_rate),
    })),
    generatedAt: new Date(),
  };

  const bytes = await generateInvoicePDF(input);

  if (opts.persist && !isProvisionalReference(inv.reference)) {
    try {
      await persistGeneratedDocument(sb as never, {
        organizationId: inv.organization_id,
        dossierId: inv.dossier_id ?? null,
        kind: 'facture',
        title: `${inv.kind === 'credit_note' ? 'Avoir' : 'Facture'} ${inv.reference}`,
        bytes,
        generationInput: input,
      });
    } catch (e) {
      console.error('[facture] archivage impossible', inv.id, e);
    }
  }

  return { bytes, reference: inv.reference, header: inv, recipient };
}
