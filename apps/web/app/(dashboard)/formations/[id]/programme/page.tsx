// ARCHETYPE: workflow
// Justification : édition du Programme de formation (thème + sections + aperçu
// live). Charge la formation (metadata incluse) + l'identité OF, initialise le
// programme (personnalisé stocké, sinon dérivé), pré-remplit le logo OF, et
// monte l'éditeur client.

import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { supabaseServer } from '@/shared/lib/supabase/server';
import { supabaseAdmin } from '@/shared/lib/supabase/admin';
import { loadOrgLogoDataUri } from '@/features/documents/load-org-branding';
import { deriveProgramme, type OrgAddress, type ProgrammeFormation, type ProgrammeOrg } from '@/features/formations/programme/from-formation';
import { ProgrammeEditor } from '@/features/formations/programme/programme-editor.client';
import type { Programme } from '@/features/formations/programme/types';

export const dynamic = 'force-dynamic';

type Modality = ProgrammeFormation['modality'];
const toModality = (m: string | null): Modality => (m === 'distanciel' || m === 'hybride' ? m : 'presentiel');

export default async function ProgrammeEditPage({ params }: { params: { id: string } }) {
  const sb = supabaseServer();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: fRow } = await (sb as any)
    .schema('app')
    .from('formations')
    .select(
      'id, code, title, summary, description, objectives, prerequisites, target_audience, evaluation_method, pedagogical_method, default_modality, default_duration_hours, is_published, organization_id, metadata',
    )
    .eq('id', params.id)
    .is('deleted_at', null)
    .maybeSingle();
  if (!fRow) notFound();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: oRow } = await (sb as any)
    .schema('app')
    .from('organizations')
    .select('name, legal_name, siret, naf_code, declaration_activite, address, contact_email, contact_phone, logo_path')
    .eq('id', fRow.organization_id)
    .maybeSingle();

  const c = (fRow.metadata?.catalog ?? {}) as Record<string, unknown>;
  const str = (k: string): string => (typeof c[k] === 'string' ? (c[k] as string) : '');
  const num = (k: string): number | null => (typeof c[k] === 'number' ? (c[k] as number) : null);

  const formation: ProgrammeFormation = {
    title: fRow.title ?? '',
    subtitle: str('subtitle') || (fRow.summary ?? ''),
    description: fRow.description ?? '',
    objectives: (fRow.objectives ?? []) as string[],
    prerequisites: (fRow.prerequisites ?? []) as string[],
    targetAudience: fRow.target_audience ?? '',
    pedagogicalMethod: fRow.pedagogical_method ?? '',
    teachingTeam: str('teachingTeam'),
    evaluationMethod: fRow.evaluation_method ?? '',
    resultIndicators: str('resultIndicators'),
    accessibilityInfo: str('accessibilityInfo'),
    accessDelay: str('accessDelay'),
    referentContact: str('referentContact'),
    deroulement: str('deroulement'),
    modality: toModality(fRow.default_modality),
    durationHours: fRow.default_duration_hours,
    durationDays: num('durationDays'),
    effectifMax: num('effectifMax'),
  };

  const org: ProgrammeOrg = {
    name: oRow?.name ?? null,
    legalName: oRow?.legal_name ?? null,
    siret: oRow?.siret ?? null,
    nafCode: oRow?.naf_code ?? null,
    declarationActivite: oRow?.declaration_activite ?? null,
    region: null,
    legalForm: null,
    address: (oRow?.address ?? null) as OrgAddress | null,
    contactEmail: oRow?.contact_email ?? null,
    contactPhone: oRow?.contact_phone ?? null,
    logoUrl: null,
  };

  const stored = c.programme as Programme | undefined;
  const initial: Programme = stored && stored.schemaVersion === 1 ? stored : deriveProgramme(formation, org);

  // Pré-remplit le logo OF (data-URI) si l'en-tête n'en a pas → visible dans
  // l'aperçu et embarqué dans metadata au prochain enregistrement.
  if (!initial.header.logoUrl && oRow?.logo_path) {
    const dataUri = await loadOrgLogoDataUri(supabaseAdmin(), fRow.organization_id);
    if (dataUri) initial.header = { ...initial.header, logoUrl: dataUri };
  }

  const publicHref = fRow.is_published
    ? `/catalogue/${fRow.id}?org=${encodeURIComponent(fRow.organization_id)}`
    : null;

  return (
    <div className="mx-auto w-full max-w-[1400px] px-6 py-6">
      <div className="mb-4 flex items-center justify-between">
        <Link
          href={`/formations/${fRow.id}`}
          className="inline-flex items-center gap-1.5 text-[13px] font-medium text-zinc-600 hover:text-zinc-900 dark:text-zinc-400"
        >
          <ArrowLeft className="h-4 w-4" /> Retour à la formation
        </Link>
        <h1 className="text-[15px] font-semibold text-zinc-900 dark:text-zinc-100">Programme — {fRow.title}</h1>
      </div>
      <ProgrammeEditor formationId={fRow.id} initial={initial} publicHref={publicHref} />
    </div>
  );
}
