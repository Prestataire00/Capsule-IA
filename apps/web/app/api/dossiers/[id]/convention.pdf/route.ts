import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { env } from '@/env.mjs';
import { generateConventionPDF, type ConventionInput } from '@/features/documents/generate-convention-pdf';

export const dynamic = 'force-dynamic';

const admin = () =>
  createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const sb = admin();

  const { data: dossierData, error: dossierErr } = await sb
    .schema('app')
    .from('dossiers')
    .select(`
      reference, start_date, end_date, total_hours, modality, total_amount_cents, currency, accessibility_notes,
      organization_id, learner_id, company_id,
      learner:learners(first_name, last_name, email, birth_date, address),
      company:companies(name, siret, address),
      formation:formations(title, description, objectives, prerequisites, target_audience, evaluation_method, pedagogical_method)
    `)
    .eq('id', params.id)
    .maybeSingle();

  if (dossierErr || !dossierData) {
    return NextResponse.json({ error: 'dossier_not_found', details: dossierErr?.message }, { status: 404 });
  }

  type AddressJson = { line1?: string; line2?: string; city?: string; postal_code?: string; country?: string };
  const d = dossierData as unknown as {
    reference: string;
    start_date: string;
    end_date: string;
    total_hours: number;
    modality: string;
    total_amount_cents: number | null;
    currency: string;
    accessibility_notes: string | null;
    organization_id: string;
    learner_id: string | null;
    company_id: string | null;
    learner: { first_name: string; last_name: string; email: string; birth_date: string | null; address: AddressJson | null } | null;
    company: { name: string; siret: string | null; address: AddressJson | null } | null;
    formation: { title: string; description: string | null; objectives: string[] | null; prerequisites: string[] | null; target_audience: string | null; evaluation_method: string | null; pedagogical_method: string | null } | null;
  };

  const { data: orgData } = await sb
    .schema('app')
    .from('organizations')
    .select('name, siret, declaration_activite, address, contact_email')
    .eq('id', d.organization_id)
    .maybeSingle();
  const org = (orgData as {
    name: string;
    siret: string | null;
    declaration_activite: string | null;
    address: AddressJson | null;
    contact_email: string | null;
  } | null) ?? null;

  const composeAddress = (addr: AddressJson | null | undefined): string | null => {
    if (!addr || typeof addr !== 'object') return null;
    const parts = [
      [addr.line1, addr.line2].filter(Boolean).join(' '),
      [addr.postal_code, addr.city].filter(Boolean).join(' '),
      addr.country,
    ].filter((p) => p && p.trim().length > 0);
    return parts.length ? parts.join(', ') : null;
  };

  const input: ConventionInput = {
    organization: {
      name: org?.name ?? 'Organisme de formation',
      siret: org?.siret ?? null,
      nda: org?.declaration_activite ?? null,
      address: composeAddress(org?.address),
      representativeName: org?.contact_email ?? null,
    },
    learner: {
      firstName: d.learner?.first_name ?? '—',
      lastName: d.learner?.last_name ?? '—',
      email: d.learner?.email ?? '—',
      birthDate: d.learner?.birth_date ?? null,
      address: composeAddress(d.learner?.address),
    },
    company: d.company
      ? {
          name: d.company.name,
          siret: d.company.siret,
          address: composeAddress(d.company.address),
        }
      : null,
    funder: null,
    formation: {
      title: d.formation?.title ?? '—',
      description: d.formation?.description ?? null,
      objectives: d.formation?.objectives ?? [],
      targetAudience: d.formation?.target_audience ?? null,
      prerequisites: d.formation?.prerequisites ?? [],
      evaluationMethod: d.formation?.evaluation_method ?? null,
      pedagogicalMethod: d.formation?.pedagogical_method ?? null,
    },
    dossier: {
      reference: d.reference,
      startDate: d.start_date,
      endDate: d.end_date,
      totalHours: d.total_hours,
      modality: d.modality,
      totalAmountCents: d.total_amount_cents,
      currency: d.currency,
      accessibilityNotes: d.accessibility_notes,
    },
    generatedAt: new Date(),
  };

  const pdfBytes = await generateConventionPDF(input);
  const filename = `convention-${d.reference}.pdf`;

  await sb.schema('app').from('resource_access_log' as never).insert({
    organization_id: d.organization_id,
    target_kind: 'document', target_id: params.id, dossier_id: params.id,
    learner_id: d.learner_id ?? null, actor_kind: 'system', action: 'download',
  } as never);

  return new NextResponse(new Uint8Array(pdfBytes), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${filename}"`,
      'Cache-Control': 'private, no-cache, no-store, max-age=0, must-revalidate',
    },
  });
}
