// ARCHETYPE: shared
// Mapping pur (sans I/O) entre les valeurs du formulaire et la ligne app.formations.
// Champs connus → colonnes ; tout le reste → metadata.catalog (JSONB).

import type { FormationFormValues } from './formation.schema';
import { emptyFormationValues } from './formation.schema';

export type InsertContext = { organizationId: string; userId: string };

/** Slug URL-safe : minuscule, sans accents, alphanumérique + tirets. */
export function slugify(input: string): string {
  const base = input
    .normalize('NFD')
    .replace(new RegExp('[\\u0300-\\u036f]', 'g'), '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return base || 'formation';
}

const numOrNull = (s: string): number | null =>
  s.trim() === '' || !Number.isFinite(Number(s)) ? null : Number(s);

const centsOrNull = (s: string): number | null => {
  const n = numOrNull(s);
  return n === null ? null : Math.round(n * 100);
};

const strFrom = (n: number | null | undefined): string => (n === null || n === undefined ? '' : String(n));

/**
 * Les tarifs sont stockés HT — c'est ce que consomment le devis, le plan de
 * facturation et le BPF. Une saisie en TTC est donc ramenée au HT avec le taux
 * retenu sur la formation ; l'unité choisie est mémorisée pour ré-afficher le
 * formulaire dans la même unité.
 */
const vatRateOf = (v: FormationFormValues): number => {
  const rate = Number(v.priceVatRate);
  return Number.isFinite(rate) && rate > 0 ? rate : 0;
};

const htCentsOrNull = (v: FormationFormValues, price: string): number | null => {
  const cents = centsOrNull(price);
  if (cents === null) return null;
  const rate = vatRateOf(v);
  if (v.priceMode !== 'ttc' || rate === 0) return cents;
  return Math.round(cents / (1 + rate / 100));
};
const eurosFrom = (cents: number | null | undefined): string =>
  cents === null || cents === undefined ? '' : String(cents / 100);

/** Ré-affiche un montant stocké HT dans l'unité de saisie de la formation. */
const eurosInMode = (
  c: Partial<CatalogMeta>,
  htCents: number | null | undefined,
): string => {
  if (htCents === null || htCents === undefined) return '';
  const rate = c.priceMode === 'ttc' ? Number(c.priceVatRate ?? 0) : 0;
  if (rate <= 0) return eurosFrom(htCents);
  return eurosFrom(Math.round(htCents * (1 + rate / 100)));
};

/** Sous-objet metadata.catalog : tous les champs SoSafe sans colonne dédiée. */
export type CatalogMeta = {
  subtitle: string;
  version: string;
  status: FormationFormValues['status'];
  durationDays: number | null;
  effectifMin: number | null;
  effectifMax: number | null;
  priceMode: FormationFormValues['priceMode'];
  priceVatRate: number | null;
  priceEntrepriseCents: number | null;
  priceParticulierCents: number | null;
  priceIndependantCents: number | null;
  categories: string[];
  imageUrl: string;
  videoUrl: string;
  eligibleCpf: boolean;
  publishedToCatalog: boolean;
  defaultLocation: string;
  defaultCity: string;
  defaultDepartment: string;
  actionType: FormationFormValues['actionType'];
  isDpc: boolean;
  diplomeVise: string;
  titreVise: string;
  codeNsf: string;
  certifying: boolean;
  qualifying: boolean;
  certificationObtention: string;
  certificationDetails: string;
  validityValue: number | null;
  validityUnit: FormationFormValues['validityUnit'];
  recyclingEnabled: boolean;
  recyclingReminderValue: number | null;
  recyclingReminderUnit: FormationFormValues['recyclingReminderUnit'];
  certifType: FormationFormValues['certifType'];
  certifEmetteur: string;
  certifNomCertificateur: string;
  certifIdentifiantCertificateur: string;
  certifNumeroContrat: string;
  certifModaliteAcces: string;
  certifModaliteObtention: string;
  certifDateEnregistrement: string;
  certifDonneeCertifiee: boolean;
  fundingTypes: string[];
  programContent: string;
  teachingTeam: string;
  defaultTrainerId: string;
  deroulement: string;
  resultIndicators: string;
  accessibilityInfo: string;
  accessDelay: string;
  referentContact: string;
  referentContactEmail: string;
  referentContactPhone: string;
  referentHandicap: string;
  referentHandicapEmail: string;
  referentHandicapPhone: string;
};

function toCatalogMeta(v: FormationFormValues): CatalogMeta {
  return {
    subtitle: v.subtitle,
    version: v.version,
    status: v.status,
    durationDays: numOrNull(v.durationDays),
    effectifMin: numOrNull(v.effectifMin),
    effectifMax: numOrNull(v.effectifMax),
    priceMode: v.priceMode,
    priceVatRate: numOrNull(v.priceVatRate),
    priceEntrepriseCents: htCentsOrNull(v, v.priceEntreprise),
    priceParticulierCents: htCentsOrNull(v, v.priceParticulier),
    priceIndependantCents: htCentsOrNull(v, v.priceIndependant),
    categories: v.categories,
    imageUrl: v.imageUrl,
    videoUrl: v.videoUrl,
    eligibleCpf: v.eligibleCpf,
    publishedToCatalog: v.publishedToCatalog,
    defaultLocation: v.defaultLocation,
    defaultCity: v.defaultCity,
    defaultDepartment: v.defaultDepartment,
    actionType: v.actionType,
    isDpc: v.isDpc,
    diplomeVise: v.diplomeVise,
    titreVise: v.titreVise,
    codeNsf: v.codeNsf,
    certifying: v.certifying,
    qualifying: v.qualifying,
    certificationObtention: v.certificationObtention,
    certificationDetails: v.certificationDetails,
    validityValue: numOrNull(v.validityValue),
    validityUnit: v.validityUnit,
    recyclingEnabled: v.recyclingEnabled,
    recyclingReminderValue: numOrNull(v.recyclingReminderValue),
    recyclingReminderUnit: v.recyclingReminderUnit,
    certifType: v.certifType,
    certifEmetteur: v.certifEmetteur,
    certifNomCertificateur: v.certifNomCertificateur,
    certifIdentifiantCertificateur: v.certifIdentifiantCertificateur,
    certifNumeroContrat: v.certifNumeroContrat,
    certifModaliteAcces: v.certifModaliteAcces,
    certifModaliteObtention: v.certifModaliteObtention,
    certifDateEnregistrement: v.certifDateEnregistrement,
    certifDonneeCertifiee: v.certifDonneeCertifiee,
    fundingTypes: v.fundingTypes,
    programContent: v.programContent,
    teachingTeam: v.teachingTeam,
    defaultTrainerId: v.defaultTrainerId,
    deroulement: v.deroulement,
    resultIndicators: v.resultIndicators,
    accessibilityInfo: v.accessibilityInfo,
    accessDelay: v.accessDelay,
    referentContact: v.referentContact,
    referentContactEmail: v.referentContactEmail,
    referentContactPhone: v.referentContactPhone,
    referentHandicap: v.referentHandicap,
    referentHandicapEmail: v.referentHandicapEmail,
    referentHandicapPhone: v.referentHandicapPhone,
  };
}

/** Colonnes app.formations communes (create + update), sans organization_id/created_by. */
function toColumns(v: FormationFormValues) {
  const code = v.code.trim() !== '' ? v.code.trim() : slugify(v.title);
  const slug = slugify(code);
  return {
    code,
    slug,
    title: v.title.trim(),
    summary: v.subtitle.trim() || null,
    description: v.description.trim() || null,
    objectives: v.objectives,
    prerequisites: v.prerequisites,
    target_audience: v.targetAudience.trim() || null,
    evaluation_method: v.evaluationMethod.trim() || null,
    pedagogical_method: v.pedagogicalMethod.trim() || null,
    default_modality: v.modality,
    default_duration_hours: Number(v.durationHours),
    default_price_cents: htCentsOrNull(v, v.priceBase) ?? 0,
    rncp_code: v.rncpCode.trim() || null,
    rs_code: v.rsCode.trim() || null,
    certificateur: v.certificateur.trim() || null,
    is_published: v.status === 'published',
  };
}

/** Ligne d'insertion complète. */
export function toInsert(v: FormationFormValues, ctx: InsertContext) {
  return {
    organization_id: ctx.organizationId,
    created_by: ctx.userId,
    updated_by: ctx.userId,
    ...toColumns(v),
    metadata: { catalog: toCatalogMeta(v) },
  };
}

/** Patch de mise à jour : préserve les éventuelles autres clés de metadata. */
export function toUpdate(
  v: FormationFormValues,
  ctx: { userId: string },
  existingMetadata: Record<string, unknown> | null,
) {
  return {
    updated_by: ctx.userId,
    ...toColumns(v),
    metadata: { ...(existingMetadata ?? {}), catalog: toCatalogMeta(v) },
  };
}

/** Forme minimale d'une ligne app.formations lue pour pré-remplir le formulaire. */
export type FormationRowLike = {
  code: string | null;
  title: string | null;
  summary: string | null;
  description: string | null;
  objectives: string[] | null;
  prerequisites: string[] | null;
  target_audience: string | null;
  evaluation_method: string | null;
  pedagogical_method: string | null;
  default_modality: string | null;
  default_duration_hours: number | null;
  default_price_cents: number | null;
  rncp_code: string | null;
  rs_code: string | null;
  certificateur: string | null;
  is_published: boolean | null;
  metadata: { catalog?: Partial<CatalogMeta> } | null;
};

/** Ligne DB → valeurs de formulaire (édition). Symétrique de toInsert. */
export function fromRow(row: FormationRowLike): FormationFormValues {
  const c: Partial<CatalogMeta> = row.metadata?.catalog ?? {};
  const e = emptyFormationValues;
  return {
    title: row.title ?? '',
    subtitle: c.subtitle ?? row.summary ?? '',
    code: row.code ?? '',
    version: c.version ?? e.version,
    description: row.description ?? '',
    modality: (row.default_modality as FormationFormValues['modality']) ?? 'presentiel',
    durationHours: strFrom(row.default_duration_hours),
    durationDays: strFrom(c.durationDays ?? null),
    effectifMin: strFrom(c.effectifMin ?? null),
    effectifMax: strFrom(c.effectifMax ?? null),
    status: c.status ?? (row.is_published ? 'published' : 'draft'),
    priceMode: c.priceMode === 'ttc' ? 'ttc' : 'ht',
    priceVatRate: strFrom(c.priceVatRate ?? null),
    priceBase: eurosInMode(c, row.default_price_cents),
    priceEntreprise: eurosInMode(c, c.priceEntrepriseCents ?? null),
    priceParticulier: eurosInMode(c, c.priceParticulierCents ?? null),
    priceIndependant: eurosInMode(c, c.priceIndependantCents ?? null),
    categories: c.categories ?? [],
    imageUrl: c.imageUrl ?? '',
    videoUrl: c.videoUrl ?? '',
    eligibleCpf: c.eligibleCpf ?? false,
    publishedToCatalog: c.publishedToCatalog ?? false,
    defaultLocation: c.defaultLocation ?? '',
    defaultCity: c.defaultCity ?? '',
    defaultDepartment: c.defaultDepartment ?? '',

    actionType: c.actionType ?? 'action_formation',
    isDpc: c.isDpc ?? false,
    diplomeVise: c.diplomeVise ?? '',
    titreVise: c.titreVise ?? '',
    codeNsf: c.codeNsf ?? '',
    certifying: c.certifying ?? false,
    qualifying: c.qualifying ?? false,
    certificationObtention: c.certificationObtention ?? '',
    certificationDetails: c.certificationDetails ?? '',
    validityValue: strFrom(c.validityValue ?? null),
    validityUnit: c.validityUnit ?? 'annees',
    recyclingEnabled: c.recyclingEnabled ?? false,
    recyclingReminderValue: strFrom(c.recyclingReminderValue ?? null),
    recyclingReminderUnit: c.recyclingReminderUnit ?? 'mois',
    certifType: c.certifType ?? 'sans',
    rncpCode: row.rncp_code ?? '',
    rsCode: row.rs_code ?? '',
    certificateur: row.certificateur ?? '',
    certifEmetteur: c.certifEmetteur ?? '',
    certifNomCertificateur: c.certifNomCertificateur ?? '',
    certifIdentifiantCertificateur: c.certifIdentifiantCertificateur ?? '',
    certifNumeroContrat: c.certifNumeroContrat ?? '',
    certifModaliteAcces: c.certifModaliteAcces ?? '',
    certifModaliteObtention: c.certifModaliteObtention ?? '',
    certifDateEnregistrement: c.certifDateEnregistrement ?? '',
    certifDonneeCertifiee: c.certifDonneeCertifiee ?? false,
    fundingTypes: c.fundingTypes ?? [],

    programContent: c.programContent ?? '',
    objectives: row.objectives ?? [],
    targetAudience: row.target_audience ?? '',
    pedagogicalMethod: row.pedagogical_method ?? '',
    teachingTeam: c.teachingTeam ?? '',
    defaultTrainerId: c.defaultTrainerId ?? '',
    deroulement: c.deroulement ?? '',

    evaluationMethod: row.evaluation_method ?? '',
    resultIndicators: c.resultIndicators ?? '',

    prerequisites: row.prerequisites ?? [],
    accessibilityInfo: c.accessibilityInfo ?? '',
    accessDelay: c.accessDelay ?? '',
    referentContact: c.referentContact ?? '',
    referentContactEmail: c.referentContactEmail ?? '',
    referentContactPhone: c.referentContactPhone ?? '',
    referentHandicap: c.referentHandicap ?? '',
    referentHandicapEmail: c.referentHandicapEmail ?? '',
    referentHandicapPhone: c.referentHandicapPhone ?? '',
  };
}
