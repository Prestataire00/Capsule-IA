// ARCHETYPE: shared
// Génère un Programme par défaut à partir d'une formation + de l'organisme.
// Utilisé quand aucun programme personnalisé n'est encore stocké
// (metadata.catalog.programme absent) : sert de graine à l'éditeur et de rendu
// public par défaut. Pur (aucun I/O).

import {
  DEFAULT_THEME,
  sectionId,
  type Programme,
  type ProgrammeMetaItem,
  type ProgrammeSection,
} from './types';

/** Adresse stockée en JSONB sur app.organizations. */
export type OrgAddress = {
  line1?: string | null;
  line2?: string | null;
  postal_code?: string | null;
  city?: string | null;
  country?: string | null;
};

/** Sous-ensemble organisme nécessaire au bandeau + pied de page légal. */
export type ProgrammeOrg = {
  name: string | null;
  legalName: string | null;
  siret: string | null;
  nafCode: string | null;
  declarationActivite: string | null;
  region: string | null;
  legalForm: string | null;
  address: OrgAddress | null;
  contactEmail: string | null;
  contactPhone: string | null;
  logoUrl: string | null;
};

/** Sous-ensemble formation nécessaire à la dérivation. */
export type ProgrammeFormation = {
  title: string;
  subtitle: string;
  description: string; // HTML
  objectives: string[];
  prerequisites: string[];
  targetAudience: string;
  pedagogicalMethod: string; // HTML
  teachingTeam: string; // HTML
  evaluationMethod: string; // HTML
  resultIndicators: string; // HTML
  accessibilityInfo: string; // HTML
  accessDelay: string;
  referentContact: string;
  referentContactEmail: string;
  referentContactPhone: string;
  referentHandicap: string;
  referentHandicapEmail: string;
  referentHandicapPhone: string;
  deroulement: string;
  modality: 'presentiel' | 'distanciel' | 'hybride';
  durationHours: number | null;
  durationDays: number | null;
  effectifMax: number | null;
};

const MODALITY_LABEL: Record<ProgrammeFormation['modality'], string> = {
  presentiel: 'Présentiel',
  distanciel: 'Distanciel',
  hybride: 'Hybride',
};

/** Réduit un fragment HTML en texte brut (pour les cellules label/valeur). */
export function htmlToPlain(html: string): string {
  return html
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6]|tr)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function durationLabel(f: ProgrammeFormation): string {
  const h = f.durationHours ?? 0;
  const d = f.durationDays ?? 0;
  if (d > 0) return `${d} jour${d > 1 ? 's' : ''} de ${h > 0 ? Math.round(h / d) : 7} heures`;
  if (h > 0) return `${h} heures`;
  return '';
}

function effectifLabel(f: ProgrammeFormation): string {
  return f.effectifMax && f.effectifMax > 0 ? `${f.effectifMax} participants` : '';
}

/** Bandeau de méta (durée · format · effectif) — n'inclut que les non-vides. */
function metaItems(f: ProgrammeFormation): ProgrammeMetaItem[] {
  const items: ProgrammeMetaItem[] = [];
  const dur = durationLabel(f);
  if (dur) items.push({ icon: 'clock', text: dur });
  items.push({ icon: f.modality === 'distanciel' ? 'remote' : 'location', text: MODALITY_LABEL[f.modality] });
  const eff = effectifLabel(f);
  if (eff) items.push({ icon: 'users', text: eff });
  return items;
}

/** Dérive le SIREN (9 premiers chiffres) d'un SIRET (14 chiffres). */
function sirenFromSiret(siret: string | null): string {
  const digits = (siret ?? '').replace(/\D/g, '');
  return digits.length >= 9 ? digits.slice(0, 9) : '';
}

function formatSiret(siret: string | null): string {
  const d = (siret ?? '').replace(/\D/g, '');
  if (d.length !== 14) return siret ?? '';
  return `${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6, 9)} ${d.slice(9)}`;
}

function formatSiren(siret: string | null): string {
  const d = sirenFromSiret(siret);
  if (d.length !== 9) return d;
  return `${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6, 9)}`;
}

function addressLine(a: OrgAddress | null): string {
  if (!a) return '';
  const parts = [a.line1, a.line2, [a.postal_code, a.city].filter(Boolean).join(' ')].filter(Boolean);
  return parts.join(', ');
}

function buildFooterLines(org: ProgrammeOrg): { legalLine: string; lines: string[] } {
  const name = org.legalName || org.name || 'Organisme de formation';
  const legalLine = org.legalForm ? `${name} – ${org.legalForm}` : name;

  const idParts: string[] = [];
  const siren = formatSiren(org.siret);
  if (siren) idParts.push(`SIREN ${siren}`);
  const siret = formatSiret(org.siret);
  if (siret) idParts.push(`SIRET ${siret}`);

  const contactParts: string[] = [];
  const addr = addressLine(org.address);
  if (addr) contactParts.push(addr);
  if (org.contactPhone) contactParts.push(`Tél. : ${org.contactPhone}`);
  if (org.contactEmail) contactParts.push(org.contactEmail);

  const legalRefParts: string[] = [];
  if (org.declarationActivite) legalRefParts.push(`NDA : ${org.declarationActivite}`);
  if (org.region) legalRefParts.push(org.region);
  if (org.nafCode) legalRefParts.push(`Code NAF/APE : ${org.nafCode}`);

  const lines = [idParts.join(' – '), contactParts.join(' | '), legalRefParts.join(' – ')].filter(
    (l) => l.trim() !== '',
  );
  return { legalLine, lines };
}

/** « Nom — e-mail — tél », en sautant ce qui n'est pas renseigné. */
function contactValue(name: string, email: string, phone: string): string {
  return [name, email, phone].map((v) => (v ?? '').trim()).filter(Boolean).join(' — ');
}

function nonEmptyRows(rows: Array<{ label: string; value: string }>) {
  return rows.filter((r) => r.value.trim() !== '');
}

/**
 * Construit le Programme par défaut. Les sections vides (aucune donnée source)
 * sont conservées avec un contenu vide plutôt qu'omises : l'éditeur les montre,
 * l'utilisateur les remplit ; le rendu public masque ce qui reste vide.
 */
export function deriveProgramme(f: ProgrammeFormation, org: ProgrammeOrg): Programme {
  const sections: ProgrammeSection[] = [];

  // Présentation (texte riche depuis la description).
  sections.push({ id: sectionId('richtext', 0), type: 'richtext', title: 'Présentation', html: f.description });

  // Informations générales (tableau label/valeur).
  sections.push({
    id: sectionId('keyvalue', 1),
    type: 'keyvalue',
    title: 'Informations générales',
    rows: nonEmptyRows([
      { label: 'Public cible', value: htmlToPlain(f.targetAudience) },
      { label: 'Effectif', value: effectifLabel(f) },
      { label: 'Durée', value: durationLabel(f) },
      { label: 'Format', value: MODALITY_LABEL[f.modality] },
      { label: 'Approche pédagogique', value: '' },
      { label: 'Prérequis', value: f.prerequisites.join(', ') },
      { label: 'Accessibilité', value: htmlToPlain(f.accessibilityInfo) },
    ]),
  });

  // Objectifs globaux (puces).
  sections.push({
    id: sectionId('bullets', 2),
    type: 'bullets',
    title: 'Objectifs globaux de la formation',
    items: f.objectives,
  });

  // Vue d'ensemble + modules détaillés (structuré ; vide par défaut).
  sections.push({
    id: sectionId('modules', 3),
    type: 'modules',
    title: 'Vue d’ensemble du programme',
    overviewTitle: 'Vue d’ensemble du programme',
    overview: [],
    totalLabel: 'Durée totale',
    totalValue: durationLabel(f),
    modules: [],
  });

  // Déroulé de la journée (planning horaire ; vide par défaut).
  sections.push({
    id: sectionId('schedule', 4),
    type: 'schedule',
    title: 'Déroulé de la journée',
    columns: ['Horaire', 'Contenu', 'Durée'],
    rows: [],
  });

  // Méthodes et moyens pédagogiques.
  sections.push({
    id: sectionId('keyvalue', 5),
    type: 'keyvalue',
    title: 'Méthodes et moyens pédagogiques',
    rows: nonEmptyRows([
      { label: 'Méthodes', value: htmlToPlain(f.pedagogicalMethod) },
      { label: 'Moyens', value: '' },
      { label: 'Encadrement', value: htmlToPlain(f.teachingTeam) },
      { label: 'Compétences visées', value: '' },
    ]),
  });

  // Modalités de suivi et d'évaluation.
  sections.push({
    id: sectionId('keyvalue', 6),
    type: 'keyvalue',
    title: 'Modalités de suivi et d’évaluation',
    rows: nonEmptyRows([
      { label: 'Évaluation des acquis', value: htmlToPlain(f.evaluationMethod) },
      { label: 'Suivi & satisfaction', value: htmlToPlain(f.resultIndicators) },
    ]),
  });

  // Modalités d'accueil et d'accompagnement.
  sections.push({
    id: sectionId('keyvalue', 7),
    type: 'keyvalue',
    title: 'Modalités d’accueil et d’accompagnement',
    rows: nonEmptyRows([
      { label: 'Accessibilité', value: htmlToPlain(f.accessibilityInfo) },
      { label: 'Délai d’accès', value: f.accessDelay },
      { label: 'Référent pédagogique', value: contactValue(f.referentContact, f.referentContactEmail, f.referentContactPhone) },
      { label: 'Référent handicap', value: contactValue(f.referentHandicap, f.referentHandicapEmail, f.referentHandicapPhone) },
    ]),
  });

  const footer = buildFooterLines(org);

  return {
    schemaVersion: 1,
    theme: { ...DEFAULT_THEME },
    header: {
      logoUrl: org.logoUrl ?? '',
      kicker: 'Programme de Formation',
      orgName: (org.name || org.legalName || '').toUpperCase(),
      title: f.title,
      subtitle: f.subtitle,
      metaItems: metaItems(f),
    },
    sections,
    footer: {
      legalLine: footer.legalLine,
      lines: footer.lines,
      versionLine: '',
    },
  };
}
