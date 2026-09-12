import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { env } from '@/env.mjs';
import { generateAttestationPDF, type AttestationInput } from '@/features/documents/generate-attestation-pdf';
import { loadOrgBranding } from '@/features/documents/load-org-branding';
import { persistGeneratedDocument } from '@/features/documents/persist-document';
import { canAccessDossier } from '@/features/documents/guard-dossier-access';

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

// Attestation d'entrée / de démarrage en formation (délivrée aux présents).
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  if (!(await canAccessDossier(params.id))) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
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
    learner_id: string | null;
    learner: { first_name: string; last_name: string; email: string; birth_date: string | null } | null;
    formation: { title: string; objectives: string[] | null } | null;
  };

  const { data: orgData } = await sb
    .schema('app')
    .from('organizations')
    .select('name, siret, declaration_activite, address, contact_email, contact_phone, certifications')
    .eq('id', d.organization_id)
    .maybeSingle();
  const org = (orgData as {
    name: string;
    siret: string | null;
    declaration_activite: string | null;
    address: AddressJson | null;
    contact_email: string | null;
  } | null) ?? null;

  const branding = await loadOrgBranding(sb as never, d.organization_id);

  const input: AttestationInput = {
    organization: {
      name: org?.name ?? 'Organisme de formation',
      siret: org?.siret ?? null,
      nda: org?.declaration_activite ?? null,
      address: composeAddress(org?.address),
      contactEmail: org?.contact_email ?? null,
      contactPhone: (org as { contact_phone?: string | null } | null)?.contact_phone ?? null,
      certifications: (org as { certifications?: string | null } | null)?.certifications ?? null,
      representativeName: branding.representativeName ?? org?.contact_email ?? null,
    },
    signaturePng: branding.signaturePng,
    stampPng: branding.stampPng,
    logoPng: branding.logoPng,
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
      attendanceRate: 0,
    },
    generatedAt: new Date(),
    variant: 'entree',
  };

  const pdfBytes = await generateAttestationPDF(input);

  try {
    await persistGeneratedDocument(sb as never, {
      organizationId: d.organization_id,
      dossierId: params.id,
      kind: 'attestation_entree',
      title: "Attestation d'entrée en formation",
      bytes: pdfBytes,
      generationInput: input,
      sourceKey: `attestation_entree:${params.id}`,
      sourceUrl: `/api/dossiers/${params.id}/attestation-entree.pdf`,
    });
  } catch (e) {
    console.error('[attestation-entree] persist failed', e);
  }

  try {
    await sb.schema('app').from('resource_access_log' as never).insert({
      organization_id: d.organization_id,
      target_kind: 'document',
      target_id: params.id,
      dossier_id: params.id,
      learner_id: d.learner_id ?? null,
      actor_kind: 'system',
      action: 'download',
    } as never);
  } catch (err) {
    console.error('resource_access_log insert failed (non-bloquant)', err);
  }

  return new NextResponse(new Uint8Array(pdfBytes), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="attestation-entree-${d.reference}.pdf"`,
      'Cache-Control': 'private, no-cache, no-store, max-age=0, must-revalidate',
    },
  });
}
