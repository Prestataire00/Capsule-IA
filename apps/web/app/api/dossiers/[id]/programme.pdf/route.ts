import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { env } from '@/env.mjs';
import { generateProgrammePDF, type ProgrammeInput } from '@/features/documents/generate-programme-pdf';
import { loadOrgBranding } from '@/features/documents/load-org-branding';

import { canAccessDossier } from '@/features/documents/guard-dossier-access';

export const dynamic = 'force-dynamic';

const admin = () =>
  createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  if (!(await canAccessDossier(params.id))) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  const sb = admin();

  const { data: dossierData, error: dossierErr } = await sb
    .schema('app')
    .from('dossiers')
    .select(`
      reference, start_date, end_date, total_hours, modality, total_amount_cents, currency, accessibility_notes,
      organization_id,
      formation:formations(title, objectives, prerequisites, target_audience, evaluation_method, pedagogical_method)
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
    formation: {
      title: string;
      objectives: string[] | null;
      prerequisites: string[] | null;
      target_audience: string | null;
      evaluation_method: string | null;
      pedagogical_method: string | null;
    } | null;
  };

  const { data: orgData } = await sb
    .schema('app')
    .from('organizations')
    .select('name, siret, declaration_activite, address')
    .eq('id', d.organization_id)
    .maybeSingle();

  const org = (orgData as {
    name: string;
    siret: string | null;
    declaration_activite: string | null;
    address: AddressJson | null;
  } | null) ?? null;

  const { data: modulesData } = await sb
    .schema('app')
    .from('dossier_modules')
    .select('position, title_snapshot, duration_hours, start_date, end_date')
    .eq('dossier_id', params.id)
    .order('position', { ascending: true });

  const modules = (modulesData ?? []) as Array<{
    position: number;
    title_snapshot: string;
    duration_hours: number;
    start_date: string | null;
    end_date: string | null;
  }>;

  const { data: sessionsData } = await sb
    .schema('app')
    .from('sessions')
    .select('starts_at, ends_at, location, remote_url, zoom_join_url')
    .eq('dossier_id', params.id)
    .order('starts_at', { ascending: true });

  const sessions = (sessionsData ?? []) as Array<{
    starts_at: string;
    ends_at: string;
    location: string | null;
    remote_url: string | null;
    zoom_join_url: string | null;
  }>;

  const composeAddress = (addr: AddressJson | null | undefined): string | null => {
    if (!addr || typeof addr !== 'object') return null;
    const parts = [
      [addr.line1, addr.line2].filter(Boolean).join(' '),
      [addr.postal_code, addr.city].filter(Boolean).join(' '),
      addr.country,
    ].filter((p) => p && p.trim().length > 0);
    return parts.length ? parts.join(', ') : null;
  };

  const branding = await loadOrgBranding(sb as never, d.organization_id);

  const input: ProgrammeInput = {
    organization: {
      name: org?.name ?? 'Organisme de formation',
      siret: org?.siret ?? null,
      nda: org?.declaration_activite ?? null,
      address: composeAddress(org?.address),
    },
    logoPng: branding.logoPng,
    formation: {
      title: d.formation?.title ?? '—',
      objectives: d.formation?.objectives ?? [],
      prerequisites: d.formation?.prerequisites ?? [],
      targetAudience: d.formation?.target_audience ?? null,
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
    modules: modules.map((m) => ({
      position: m.position,
      title: m.title_snapshot,
      durationHours: m.duration_hours,
      startDate: m.start_date,
      endDate: m.end_date,
    })),
    sessions: sessions.map((s) => ({
      startsAt: s.starts_at,
      endsAt: s.ends_at,
      location: s.location,
      remoteUrl: s.remote_url ?? s.zoom_join_url,
    })),
    generatedAt: new Date(),
  };

  const pdfBytes = await generateProgrammePDF(input);

  const filename = `programme-${d.reference}.pdf`;

  return new NextResponse(new Uint8Array(pdfBytes), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${filename}"`,
      'Cache-Control': 'private, no-cache, no-store, max-age=0, must-revalidate',
    },
  });
}
