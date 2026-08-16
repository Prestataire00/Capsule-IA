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
import type { Programme, ProgrammeSection } from './types';
import { env } from '@/env.mjs';

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
  referentContactEmail?: string;
  referentContactPhone?: string;
  referentHandicap?: string;
  referentHandicapEmail?: string;
  referentHandicapPhone?: string;
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
  /** Formateur par défaut de la formation (RPC 0126) — profil public seulement. */
  default_trainer: {
    first_name: string | null;
    last_name: string | null;
    bio: string | null;
    photo_path: string | null;
  } | null;
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
    referentContactEmail: c.referentContactEmail ?? '',
    referentContactPhone: c.referentContactPhone ?? '',
    referentHandicap: c.referentHandicap ?? '',
    referentHandicapEmail: c.referentHandicapEmail ?? '',
    referentHandicapPhone: c.referentHandicapPhone ?? '',
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

const escapeHtml = (v: string): string =>
  v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function buildTrainerSection(trainer: FullRow['default_trainer']): ProgrammeSection | null {
  if (!trainer) return null;
  const name = `${trainer.first_name ?? ''} ${trainer.last_name ?? ''}`.trim();
  const bio = (trainer.bio ?? '').trim();
  if (!name && !bio) return null;

  const photoUrl = trainer.photo_path
    ? `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/trainer-photos/${trainer.photo_path}`
    : null;

  const photo = photoUrl
    ? `<img src="${escapeHtml(photoUrl)}" alt="" width="96" height="96" style="border-radius:9999px;object-fit:cover;float:left;margin:0 16px 8px 0" />`
    : '';
  const heading = name ? `<p><strong>${escapeHtml(name)}</strong></p>` : '';
  const body = bio ? `<p>${escapeHtml(bio)}</p>` : '';

  return {
    id: 'equipe-pedagogique',
    type: 'richtext',
    title: 'Équipe pédagogique',
    html: `${photo}${heading}${body}<div style="clear:both"></div>`,
  };
}

type PublicIndicators = {
  learners: number;
  satisfaction_rate: number | null;
  satisfaction_responses: number;
  last_session_end: string | null;
};

/**
 * Indicateurs de résultats publiés (Qualiopi 2), calculés en base (RPC 0127) :
 * apprenants formés et satisfaction réelle, jamais une saisie manuelle.
 */
function buildIndicatorsSection(ind: PublicIndicators | null): ProgrammeSection | null {
  if (!ind) return null;
  const rows: Array<{ label: string; value: string }> = [];

  if (ind.learners > 0) rows.push({ label: 'Apprenants formés', value: String(ind.learners) });
  if (typeof ind.satisfaction_rate === 'number') {
    rows.push({
      label: 'Taux de satisfaction',
      value: `${ind.satisfaction_rate} % (${ind.satisfaction_responses} réponse${ind.satisfaction_responses > 1 ? 's' : ''})`,
    });
  }
  if (rows.length === 0) return null;

  if (ind.last_session_end) {
    const d = new Date(ind.last_session_end);
    if (!Number.isNaN(d.getTime())) {
      rows.push({ label: 'Dernière session', value: d.toLocaleDateString('fr-FR') });
    }
  }
  rows.push({ label: 'Mise à jour', value: new Date().toLocaleDateString('fr-FR') });

  return { id: 'indicateurs-resultats', type: 'keyvalue', title: 'Indicateurs de résultats', rows };
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

  // Équipe pédagogique : rendue depuis la fiche du formateur par défaut, pas
  // recopiée dans la formation — modifier sa photo ou sa description sur sa fiche
  // met le catalogue à jour sans retoucher la formation.
  const { data: indicatorsRow } = await sb.rpc(
    'get_published_formation_indicators' as never,
    { p_id: id } as never,
  );
  const indicatorsSection = buildIndicatorsSection(
    (indicatorsRow as unknown as PublicIndicators | null) ?? null,
  );
  if (indicatorsSection) {
    const at = programme.sections.findIndex((s) => s.id === indicatorsSection.id);
    if (at >= 0) programme.sections[at] = indicatorsSection;
    else programme.sections.push(indicatorsSection);
  }

  const trainerSection = buildTrainerSection(row.default_trainer);
  if (trainerSection) {
    const at = programme.sections.findIndex((s) => s.id === trainerSection.id);
    if (at >= 0) programme.sections[at] = trainerSection;
    else programme.sections.push(trainerSection);
  }

  return {
    formationId: row.id,
    organizationId: row.organization_id,
    orgName,
    title: row.title ?? '',
    programme,
  };
}
