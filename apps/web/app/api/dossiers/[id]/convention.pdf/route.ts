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
      learner:learners(first_name, last_name, email, birth_date, address_line1, address_city, address_postal_code),
      company:companies(name, siret, address_line1, address_city, address_postal_code),
      formation:formations(title, description, objectives, prerequisites, target_audience, evaluation_method, pedagogical_method)
    `)
    .eq('id', params.id)
    .maybeSingle();

  if (dossierErr || !dossierData) {
    return NextResponse.json({ error: 'dossier_not_found' }, { status: 404 });
  }

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
    company_id: string | null;
    learner: { first_name: string; last_name: string; email: string; birth_date: string | null; address_line1: string | null; address_city: string | null; address_postal_code: string | null } | null;
    company: { name: string; siret: string | null; address_line1: string | null; address_city: string | null; address_postal_code: string | null } | null;
    formation: { title: string; description: string | null; objectives: string[]; prerequisites: string[]; target_audience: string | null; evaluation_method: string | null; pedagogical_method: string | null } | null;
  };

  const { data: orgData } = await sb
    .schema('app')
    .from('organizations')
    .select('name, siret, declaration_activity_number, address_line1, address_city, address_postal_code, legal_representative_name')
    .eq('id', d.organization_id)
    .maybeSingle();
  const org = (orgData as {
    name: string;
    siret: string | null;
    declaration_activity_number: string | null;
    address_line1: string | null;
    address_city: string | null;
    address_postal_code: string | null;
    legal_representative_name: string | null;
  } | null) ?? null;

  const composeAddress = (l1: string | null, postal: string | null, city: string | null): string | null => {
    const parts = [l1, [postal, city].filter(Boolean).join(' ')].filter(Boolean);
    return parts.length ? parts.join(', ') : null;
  };

  const input: ConventionInput = {
    organization: {
      name: org?.name ?? 'Organisme de formation',
      siret: org?.siret ?? null,
      nda: org?.declaration_activity_number ?? null,
      address: org ? composeAddress(org.address_line1, org.address_postal_code, org.address_city) : null,
      representativeName: org?.legal_representative_name ?? null,
    },
    learner: {
      firstName: d.learner?.first_name ?? '—',
      lastName: d.learner?.last_name ?? '—',
      email: d.learner?.email ?? '—',
      birthDate: d.learner?.birth_date ?? null,
      address: d.learner ? composeAddress(d.learner.address_line1, d.learner.address_postal_code, d.learner.address_city) : null,
    },
    company: d.company
      ? {
          name: d.company.name,
          siret: d.company.siret,
          address: composeAddress(d.company.address_line1, d.company.address_postal_code, d.company.address_city),
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

  return new NextResponse(new Uint8Array(pdfBytes), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${filename}"`,
      'Cache-Control': 'private, no-cache, no-store, max-age=0, must-revalidate',
    },
  });
}
