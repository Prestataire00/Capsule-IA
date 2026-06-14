import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { env } from '@/env.mjs';
import { generateInvoicePDF, type InvoiceInput } from '@/features/documents/generate-invoice-pdf';
import { loadOrgBranding } from '@/features/documents/load-org-branding';
import { persistGeneratedDocument } from '@/features/documents/persist-document';

export const dynamic = 'force-dynamic';

type AddressJson = { line1?: string; line2?: string; city?: string; postal_code?: string; country?: string };

const admin = () =>
  createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

function composeAddress(addr: AddressJson | null | undefined): string | null {
  if (!addr || typeof addr !== 'object') return null;
  const parts = [
    [addr.line1, addr.line2].filter(Boolean).join(' '),
    [addr.postal_code, addr.city].filter(Boolean).join(' '),
    addr.country,
  ].filter((p) => p && p.trim().length > 0);
  return parts.length ? parts.join(', ') : null;
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const sb = admin();

  const { data: invRow, error: invErr } = await sb
    .schema('app')
    .from('invoices')
    .select(`
      id, reference, status, issued_at, due_at, payment_terms,
      subtotal_cents, vat_cents, total_cents, currency,
      organization_id, company_id, dossier_id,
      dossier:dossiers(reference, learner:learners(first_name, last_name, address)),
      company:companies(name, siret, address)
    `)
    .eq('id', params.id)
    .maybeSingle();

  if (invErr || !invRow) {
    return NextResponse.json({ error: 'invoice_not_found', details: invErr?.message }, { status: 404 });
  }

  const inv = invRow as unknown as {
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
    company_id: string | null;
    dossier_id: string | null;
    dossier: { reference: string; learner: { first_name: string; last_name: string; address: AddressJson | null } | null } | null;
    company: { name: string; siret: string | null; address: AddressJson | null } | null;
  };

  // Org
  const { data: orgRow } = await sb
    .schema('app')
    .from('organizations')
    .select('name, siret, declaration_activite, address, contact_email, contact_phone')
    .eq('id', inv.organization_id)
    .maybeSingle();
  const org = (orgRow as {
    name: string;
    siret: string | null;
    declaration_activite: string | null;
    address: AddressJson | null;
    contact_email: string | null;
    contact_phone: string | null;
  } | null) ?? null;

  // Lignes
  const { data: linesRows } = await sb
    .schema('app')
    .from('invoice_lines')
    .select('description, quantity, unit_amount_cents, vat_rate, position')
    .eq('invoice_id', inv.id)
    .order('position', { ascending: true });
  const lines = (linesRows ?? []) as unknown as Array<{
    description: string;
    quantity: number;
    unit_amount_cents: number;
    vat_rate: number;
    position: number;
  }>;

  // Destinataire prioritaire : company > learner
  const recipientName = inv.company?.name ?? (
    inv.dossier?.learner
      ? `${inv.dossier.learner.first_name} ${inv.dossier.learner.last_name}`
      : 'Destinataire'
  );
  const recipientSiret = inv.company?.siret ?? null;
  const recipientAddress = composeAddress(inv.company?.address ?? inv.dossier?.learner?.address);

  const orgId = inv.organization_id;
  const branding = await loadOrgBranding(sb as never, orgId);

  const input: InvoiceInput = {
    organization: {
      name: org?.name ?? 'Organisme de formation',
      siret: org?.siret ?? null,
      nda: org?.declaration_activite ?? null,
      address: composeAddress(org?.address),
      contactEmail: org?.contact_email ?? null,
      contactPhone: org?.contact_phone ?? null,
    },
    recipient: {
      name: recipientName,
      siret: recipientSiret,
      address: recipientAddress,
    },
    signaturePng: branding.signaturePng,
    stampPng: branding.stampPng,
    representativeName: branding.representativeName ?? org?.contact_email ?? null,
    representativeTitle: branding.representativeTitle,
    place: org?.address?.city ?? null,
    invoice: {
      reference: inv.reference,
      issuedAt: inv.issued_at,
      dueAt: inv.due_at,
      status: inv.status,
      subtotalCents: inv.subtotal_cents,
      vatCents: inv.vat_cents,
      totalCents: inv.total_cents,
      currency: inv.currency,
      paymentTerms: inv.payment_terms,
      dossierReference: inv.dossier?.reference ?? null,
    },
    lines: lines.map((l) => ({
      description: l.description,
      quantity: Number(l.quantity),
      unitAmountCents: l.unit_amount_cents,
      vatRate: Number(l.vat_rate),
    })),
    generatedAt: new Date(),
  };

  const pdfBytes = await generateInvoicePDF(input);

  try {
    await persistGeneratedDocument(sb as never, {
      organizationId: orgId,
      dossierId: inv.dossier_id ?? null,
      kind: 'facture',
      title: `Facture ${inv.reference}`,
      bytes: pdfBytes,
      generationInput: input,
    });
  } catch (e) {
    console.error('[facture] persist failed', e);
  }

  const filename = `facture-${inv.reference}.pdf`;

  return new NextResponse(new Uint8Array(pdfBytes), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${filename}"`,
      'Cache-Control': 'private, no-cache, no-store, max-age=0, must-revalidate',
    },
  });
}
