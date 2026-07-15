import 'server-only';
// ARCHETYPE: shared
// Chargement PUBLIC (anon) d'un programme de formation publié, via la RPC
// SECURITY DEFINER 0109. Renvoie un Programme prêt à rendre :
//   • si un programme personnalisé est stocké (metadata.catalog.programme) → lui ;
//   • sinon → dérivé des champs structurés de la formation + identité OF.
// Le logo de l'OF (bucket privé org_assets) est résolu en data-URI côté serveur
// pour les programmes qui n'en embarquent pas encore (branding public non
// sensible, borné aux formations publiées par la RPC).

import { supabaseServer } from '@/shared/lib/supabase/server';
import { supabaseAdmin } from '@/shared/lib/supabase/admin';
import { loadOrgLogoDataUri } from '@/features/documents/load-org-branding';
import { deriveProgramme, type OrgAddress, type ProgrammeFormation, type ProgrammeOrg } from './from-formation';
import type { Programme } from './types';

type Modality = ProgrammeFormation['modality'];

type OrgJson = {
  name: string | null;
  legal_name: string | null;
  siret: string | null;
  naf_code: string | null;
  declaration_activite: string | null;
  address: OrgAddress | null;
  contact_email: string | null;
  contact_phone: string | null;
  logo_path: string | null;
};

type CatalogMeta = {
  subtitle?: string;
  durationDays?: number | null;
  effectifMax?: number | null;
  teachingTeam?: string;
  resultIndicators?: string;
  accessibilityInfo?: string;
  accessDelay?: string;
  referentContact?: string;
  deroulement?: string;
  coverPath?: string;
  programme?: Programme;
};

// Télécharge un asset privé (org_assets) et le renvoie en data-URI (pour le
// rendu public : couverture de formation, etc.). Null si absent.
async function orgAssetDataUri(path: string | null | undefined): Promise<string | null> {
  if (!path) return null;
  const { data } = await supabaseAdmin().storage.from('org_assets').download(path);
  if (!data) return null;
  const buf = Buffer.from(await data.arrayBuffer());
  return `data:image/png;base64,${buf.toString('base64')}`;
}

type FullRow = {
  id: string;
  organization_id: string;
  code: string;
  title: string;
  summary: string | null;
  description: string | null;
  objectives: string[] | null;
  prerequisites: string[] | null;
  target_audience: string | null;
  evaluation_method: string | null;
  pedagogical_method: string | null;
  default_modality: string | null;
  default_duration_hours: number | null;
  metadata: { catalog?: CatalogMeta } | null;
  organization: OrgJson | null;
};

export type PublicProgrammeResult = {
  formationId: string;
  organizationId: string;
  orgName: string;
  title: string;
  programme: Programme;
};

function toModality(m: string | null): Modality {
  return m === 'distanciel' || m === 'hybride' ? m : 'presentiel';
}

function mapFormation(row: FullRow, c: CatalogMeta): ProgrammeFormation {
  return {
    title: row.title ?? '',
    subtitle: c.subtitle ?? row.summary ?? '',
    description: row.description ?? '',
    objectives: row.objectives ?? [],
    prerequisites: row.prerequisites ?? [],
    targetAudience: row.target_audience ?? '',
    pedagogicalMethod: row.pedagogical_method ?? '',
    teachingTeam: c.teachingTeam ?? '',
    evaluationMethod: row.evaluation_method ?? '',
    resultIndicators: c.resultIndicators ?? '',
    accessibilityInfo: c.accessibilityInfo ?? '',
    accessDelay: c.accessDelay ?? '',
    referentContact: c.referentContact ?? '',
    deroulement: c.deroulement ?? '',
    modality: toModality(row.default_modality),
    durationHours: row.default_duration_hours,
    durationDays: c.durationDays ?? null,
    effectifMax: c.effectifMax ?? null,
  };
}

function mapOrg(o: OrgJson | null): ProgrammeOrg {
  return {
    name: o?.name ?? null,
    legalName: o?.legal_name ?? null,
    siret: o?.siret ?? null,
    nafCode: o?.naf_code ?? null,
    declarationActivite: o?.declaration_activite ?? null,
    region: null,
    legalForm: null,
    address: o?.address ?? null,
    contactEmail: o?.contact_email ?? null,
    contactPhone: o?.contact_phone ?? null,
    logoUrl: null,
  };
}

export async function getPublicProgramme(formationId: string): Promise<PublicProgrammeResult | null> {
  const id = (formationId ?? '').trim();
  if (!id) return null;

  const sb = supabaseServer();
  const { data } = await sb.rpc('get_published_formation_full' as never, { p_id: id } as never);
  const row = (data as unknown as FullRow | null) ?? null;
  if (!row || !row.id) return null;

  const catalog = row.metadata?.catalog ?? {};
  const orgName = row.organization?.name ?? row.organization?.legal_name ?? '';

  const stored = catalog.programme;
  const programme =
    stored && stored.schemaVersion === 1 ? stored : deriveProgramme(mapFormation(row, catalog), mapOrg(row.organization));

  // Image de la formation : elle remplace le logo de l'OF dans l'en-tête (pas de
  // bannière). Uniquement sur la page programme dédiée (ce loader). Sinon, logo OF.
  if (catalog.coverPath) {
    const coverUri = await orgAssetDataUri(catalog.coverPath);
    if (coverUri) programme.header = { ...programme.header, logoUrl: coverUri, coverUrl: '' };
  } else if (!programme.header.logoUrl && row.organization?.logo_path) {
    const dataUri = await loadOrgLogoDataUri(supabaseAdmin(), row.organization_id);
    if (dataUri) programme.header = { ...programme.header, logoUrl: dataUri };
  }

  return {
    formationId: row.id,
    organizationId: row.organization_id,
    orgName,
    title: row.title ?? '',
    programme,
  };
}
