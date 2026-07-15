// ARCHETYPE: shared
// Modèle de données d'un « Programme de formation » imprimable/publiable.
// Objectif produit : reproduire la maquette Capsule IA (bandeau, sections à
// bandeaux, tableaux label/valeur, cartes de modules, déroulé horaire, pied de
// page légal) tout en restant 100 % éditable — le rendu est piloté par un thème
// (couleurs, police, logo) et une liste de sections typées.
//
// Persistance : sérialisé en JSON dans app.formations.metadata.catalog.programme.
// Pur (aucun I/O, aucun import runtime) → partageable form ↔ Server Action ↔ RSC.

/** Thème visuel — chaque valeur est injectée en variable CSS, donc éditable. */
export type ProgrammeTheme = {
  /** Violet foncé des bandeaux de section et de l'en-tête. */
  primaryColor: string;
  /** Violet médian des cartes de module. */
  secondaryColor: string;
  /** Couleur du texte sur fond violet (titres de bandeaux, cartes). */
  onPrimaryColor: string;
  /** Violet d'accent (libellés de tableau, mots-clés, titres de sous-module). */
  accentColor: string;
  /** Lavande claire des fonds de bloc / colonnes de gauche. */
  surfaceColor: string;
  /** Lavande alternée (lignes paires des tableaux). */
  surfaceAltColor: string;
  /** Couleur du corps de texte. */
  textColor: string;
  /** Couleur du texte secondaire / notes. */
  mutedColor: string;
  /** Bordures fines. */
  borderColor: string;
  /** Pile de polices (ex. "Inter, system-ui, sans-serif"). */
  fontFamily: string;
  /** Titres de section en MAJUSCULES. */
  uppercaseHeadings: boolean;
  /** Rayon des coins (px). 0 = anguleux comme le PDF. */
  cornerRadius: number;
};

export const DEFAULT_THEME: ProgrammeTheme = {
  // En-tête coloré (violet de marque) + corps AÉRÉ : bandes claires à filet
  // violet, panneaux blancs. Ni « tout violet », ni « tout noir ».
  primaryColor: '#4c1d95', // violet profond — en-tête (hero)
  secondaryColor: '#6d28d9', // violet-700
  onPrimaryColor: '#ffffff',
  accentColor: '#7c3aed', // accent violet (filets de section, libellés)
  surfaceColor: '#ffffff', // panneaux blancs (aéré)
  surfaceAltColor: '#f8fafc', // gris très clair (bandes de section, neutre)
  textColor: '#0f172a',
  mutedColor: '#64748b',
  borderColor: '#e2e8f0',
  fontFamily: 'var(--font-sans), Inter, system-ui, sans-serif',
  uppercaseHeadings: true,
  cornerRadius: 8,
};

/** Icône d'un badge d'en-tête (résolue vers lucide-react côté rendu). */
export type MetaIcon = 'clock' | 'calendar' | 'location' | 'remote' | 'users' | 'tools' | 'euro' | 'award';

export type ProgrammeMetaItem = { icon: MetaIcon; text: string };

export type ProgrammeHeader = {
  /** Data-URI ou URL du logo ; vide = pas de logo. */
  logoUrl: string;
  /** Sur-titre au-dessus du grand titre organisme (ex. « Programme de Formation »). */
  kicker: string;
  /** Nom de l'organisme en grand (ex. « CAPSULE IA »). */
  orgName: string;
  /** Titre de la formation. */
  title: string;
  /** Sous-titre (ex. « Outils : Gemini & NotebookLM »). */
  subtitle: string;
  /** Badges (durée, format, effectif…). */
  metaItems: ProgrammeMetaItem[];
};

export type KeyValueRow = { label: string; value: string };

/** Carte de la vue d'ensemble (les 3 modules en tête de la section modules). */
export type OverviewCard = { code: string; title: string; durationLabel: string };

export type ModuleSub = {
  /** Ex. « M1.1 ». */
  code: string;
  title: string;
  /** Ex. « 2h 00 » ; vide = masqué. */
  durationLabel: string;
  contenu: string[];
  objectifs: string[];
};

export type ProgrammeModule = {
  /** Ex. « MODULE 1 ». */
  code: string;
  title: string;
  durationLabel: string;
  submodules: ModuleSub[];
};

export type ScheduleRow = { time: string; label: string; duration: string };

/** Section typée — l'ordre du tableau `sections` = l'ordre de rendu. */
export type ProgrammeSection =
  | { id: string; type: 'richtext'; title: string; html: string }
  | { id: string; type: 'keyvalue'; title: string; rows: KeyValueRow[] }
  | { id: string; type: 'bullets'; title: string; items: string[] }
  | {
      id: string;
      type: 'modules';
      title: string;
      overviewTitle: string;
      overview: OverviewCard[];
      totalLabel: string;
      totalValue: string;
      modules: ProgrammeModule[];
    }
  | {
      id: string;
      type: 'schedule';
      title: string;
      columns: [string, string, string];
      rows: ScheduleRow[];
    };

export type ProgrammeSectionType = ProgrammeSection['type'];

export type ProgrammeFooter = {
  /** Ligne légale en gras (ex. « CAPSULE IA – Société par actions simplifiée (SAS) »). */
  legalLine: string;
  /** Lignes complémentaires (SIREN/SIRET, adresse, NDA/région/NAF…). */
  lines: string[];
  /** Mention de version en pied (ex. « Version 1 – Juin 2026 | Capsule IA »). */
  versionLine: string;
};

export type Programme = {
  /** Version du schéma (évolutions futures). */
  schemaVersion: 1;
  theme: ProgrammeTheme;
  header: ProgrammeHeader;
  sections: ProgrammeSection[];
  footer: ProgrammeFooter;
};

/** Génère un id de section stable-ish sans dépendre de Math.random/Date. */
export function sectionId(type: ProgrammeSectionType, index: number): string {
  return `${type}-${index}`;
}
