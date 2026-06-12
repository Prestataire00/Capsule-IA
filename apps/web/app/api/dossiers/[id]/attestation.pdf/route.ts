import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { env } from '@/env.mjs';
import { generateAttestationPDF, type AttestationInput } from '@/features/documents/generate-attestation-pdf';
import { loadOrgBranding } from '@/features/documents/load-org-branding';
import { persistGeneratedDocument } from '@/features/documents/persist-document';

export const dynamic = 'force-dynamic';

const admin = () =>
  createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

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

async function computeAttendanceRate(sb: ReturnType<typeof admin>, dossierId: string): Promise<number> {
  // % = signatures.signed / signatures.total sur les feuilles d'émargement du dossier
  const { data: sheets } = await sb
    .schema('app')
    .from('attendance_sheets')
    .select('id')
    .eq('dossier_id', dossierId);
  const sheetIds = (sheets ?? []).map((s: { id: string }) => s.id);
  if (sheetIds.length === 0) return 100;

  const [{ count: totalCount }, { count: signedCount }] = await Promise.all([
    sb.schema('app').from('attendance_signatures').select('id', { count: 'exact', head: true }).in('attendance_sheet_id', sheetIds),
    sb.schema('app').from('attendance_signatures').select('id', { count: 'exact', head: true }).in('attendance_sheet_id', sheetIds).not('signed_at', 'is', null),
  ]);
  const total = totalCount ?? 0;
  const signed = signedCount ?? 0;
  return total > 0 ? (signed / total) * 100 : 100;
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const sb = admin();

  const { data: dossierData, error: dossierErr } = await sb
    .schema('app')
    .from('dossiers')
    .select(`
      reference, start_date, end_date, total_hours, modality,
      organization_id, learner_id,
      learner:learners(first_name, last_name, email, birth_date),
      formation:formations(title, objectives)
    `)
    .eq('id', params.id)
    .maybeSingle();

  if (dossierErr || !dossierData) {
    return NextResponse.json({ error: 'dossier_not_found', details: dossierErr?.message }, { status: 404 });
  }

  const d = dossierData as unknown as {
    reference: string;
    start_date: string;
    end_date: string;
    total_hours: number;
    modality: string;
    organization_id: string;
    learner: { first_name: string; last_name: string; email: string; birth_date: string | null } | null;
    formation: { title: string; objectives: string[] | null } | null;
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

  const attendanceRate = await computeAttendanceRate(sb, params.id);

  const orgId = d.organization_id;
  const branding = await loadOrgBranding(sb as never, orgId);

  const input: AttestationInput = {
    organization: {
      name: org?.name ?? 'Organisme de formation',
      siret: org?.siret ?? null,
      nda: org?.declaration_activite ?? null,
      address: composeAddress(org?.address),
      representativeName: branding.representativeName ?? org?.contact_email ?? null,
    },
    signaturePng: branding.signaturePng,
    stampPng: branding.stampPng,
    representativeTitle: branding.representativeTitle,
    place: org?.address?.city ?? null,
    learner: {
      firstName: d.learner?.first_name ?? '—',
      lastName: d.learner?.last_name ?? '—',
      email: d.learner?.email ?? '—',
      birthDate: d.learner?.birth_date ?? null,
    },
    formation: {
      title: d.formation?.title ?? '—',
      objectives: d.formation?.objectives ?? [],
    },
    dossier: {
      reference: d.reference,
      startDate: d.start_date,
      endDate: d.end_date,
      totalHours: d.total_hours,
      modality: d.modality,
      attendanceRate,
    },
    generatedAt: new Date(),
  };

  const pdfBytes = await generateAttestationPDF(input);

  try {
    await persistGeneratedDocument(sb as never, {
      organizationId: orgId,
      dossierId: params.id,
      kind: 'attestation_fin',
      title: 'Attestation de fin de formation',
      bytes: pdfBytes,
      generationInput: input,
    });
  } catch (e) {
    console.error('[attestation] persist failed', e);
  }

  const filename = `attestation-${d.reference}.pdf`;

  return new NextResponse(new Uint8Array(pdfBytes), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${filename}"`,
      'Cache-Control': 'private, no-cache, no-store, max-age=0, must-revalidate',
    },
  });
}
