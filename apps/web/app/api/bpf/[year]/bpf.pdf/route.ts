import { NextResponse, type NextRequest } from 'next/server';
import { supabaseServer } from '@/shared/lib/supabase/server';
import { BPF_LINES } from '@/features/bpf/bpf';
import { loadBpfAggregates } from '@/features/bpf/load-bpf';
import { generateBpfPDF, type BpfInput } from '@/features/documents/generate-bpf-pdf';
import { loadOrgBranding } from '@/features/documents/load-org-branding';

export const dynamic = 'force-dynamic';

type AddressJson = { line1?: string; line2?: string; city?: string; postal_code?: string; country?: string };

function composeAddress(addr: AddressJson | null | undefined): string | null {
  if (!addr || typeof addr !== 'object') return null;
  const parts = [
    [addr.line1, addr.line2].filter(Boolean).join(' '),
    [addr.postal_code, addr.city].filter(Boolean).join(' '),
    addr.country,
  ].filter((p) => p && p.trim().length > 0);
  return parts.length ? parts.join(', ') : null;
}

export async function GET(_req: NextRequest, { params }: { params: { year: string } }) {
  if (!/^\d{4}$/.test(params.year)) {
    return NextResponse.json({ error: 'invalid_year' }, { status: 400 });
  }
  const year = Number(params.year);
  const sb = supabaseServer();

  // Organisation courante (RLS-scopé : un seul OF accessible par l'utilisateur).
  const { data: orgRow } = await sb
    .schema('app')
    .from('organizations')
    .select('id, name, legal_name, siret, declaration_activite, address, contact_email, contact_phone, certifications')
    .is('deleted_at', null)
    .limit(1)
    .maybeSingle();
  const org = (orgRow as {
    id: string;
    name: string;
    legal_name: string | null;
    siret: string | null;
    declaration_activite: string | null;
    address: AddressJson | null;
    contact_email: string | null;
    contact_phone: string | null;
  } | null) ?? null;

  if (!org) {
    return NextResponse.json({ error: 'organization_not_found' }, { status: 404 });
  }

  const [aggregates, branding] = await Promise.all([
    loadBpfAggregates(sb as never, year),
    loadOrgBranding(sb as never, org.id),
  ]);

  const input: BpfInput = {
    year,
    organization: {
      name: org.name,
      legalName: org.legal_name,
      siret: org.siret,
      nda: org.declaration_activite,
      address: composeAddress(org.address),
      contactEmail: org.contact_email,
      contactPhone: org.contact_phone,
      certifications: (org as { certifications?: string | null }).certifications ?? null,
    },
    logoPng: branding.logoPng,
    financial: {
      lines: BPF_LINES.map((l) => ({ code: l.code, label: l.label, cents: aggregates.financial.lines[l.key] })),
      totalCents: aggregates.financial.totalCents,
    },
    pedago: aggregates.pedago,
    formateurs: aggregates.formateurs,
    byCategory: aggregates.byCategory,
    byActionType: aggregates.byActionType,
    byNsf: aggregates.byNsf,
    charges: aggregates.charges,
    generatedAt: new Date(),
  };

  const pdfBytes = await generateBpfPDF(input);

  return new NextResponse(new Uint8Array(pdfBytes), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="bpf-${year}.pdf"`,
      'Cache-Control': 'private, no-cache, no-store, max-age=0, must-revalidate',
    },
  });
}
