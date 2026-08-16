// ARCHETYPE: shared
// Constantes du catalogue de formations (forme/logique reprise de SoSafe, scope Capsule IA).
// Les enums "métier réel" (modalité, statut) correspondent aux colonnes app.formations ;
// le reste alimente metadata.catalog.

export type Option = { value: string; label: string };

/** Modalités — aligné sur l'enum app.training_modality (pas de "blended" SoSafe). */
export const MODALITIES = [
  { value: 'presentiel', label: 'Présentiel' },
  { value: 'distanciel', label: 'Distanciel' },
  { value: 'hybride', label: 'Hybride' },
] as const satisfies readonly Option[];
export type Modality = (typeof MODALITIES)[number]['value'];

/** Statut de cycle de vie (mappé sur is_published, valeur riche conservée en metadata). */
export const STATUSES = [
  { value: 'draft', label: 'Brouillon' },
  { value: 'published', label: 'Publié' },
  { value: 'archived', label: 'Archivé' },
] as const satisfies readonly Option[];
export type Status = (typeof STATUSES)[number]['value'];

/** Catégories — liste constante au départ (catégories dynamiques en base = hors scope). */
export const PROGRAM_CATEGORIES = [
  'Bureautique',
  'Comptabilité / Gestion',
  'Commercial / Vente',
  'Management',
  'Langues',
  'Informatique / Numérique',
  'Intelligence artificielle',
  'Automatisation / No-code',
  'RH / Paie',
  'Sécurité / Prévention',
  'Santé / Social',
  'Qualité / RSE',
  'Marketing / Communication',
  'Développement personnel',
] as const;

/** Types de financement possibles. */
export const FUNDING_TYPES = [
  { value: 'entreprise', label: 'Entreprise / Employeur' },
  { value: 'opco', label: 'OPCO' },
  { value: 'cpf', label: 'CPF' },
  { value: 'france_travail', label: 'France Travail' },
  { value: 'fifpl', label: 'FIFPL' },
  { value: 'dpc', label: 'DPC' },
  { value: 'particulier', label: 'Particulier (fonds propres)' },
  { value: 'autre', label: 'Autre' },
] as const satisfies readonly Option[];

/** Types d'action de formation (nomenclature BPF). */
export const ACTION_TYPES = [
  { value: 'action_formation', label: 'Action de formation' },
  { value: 'bilan_competences', label: 'Bilan de compétences' },
  { value: 'vae', label: 'VAE' },
  { value: 'apprentissage', label: 'Apprentissage' },
  { value: 'formation_continue', label: 'Formation continue' },
  { value: 'formation_initiale', label: 'Formation initiale' },
] as const satisfies readonly Option[];

/** Type de certification (France Compétences). */
export const CERTIF_TYPES = [
  { value: 'sans', label: 'Sans certification' },
  { value: 'rncp', label: 'RNCP' },
  { value: 'rs', label: 'Répertoire spécifique (RS)' },
  { value: 'cqp', label: 'CQP' },
] as const satisfies readonly Option[];

export const VALIDITY_UNITS = [
  { value: 'annees', label: 'année(s)' },
  { value: 'mois', label: 'mois' },
] as const satisfies readonly Option[];

/**
 * Valeur sentinelle du sélecteur NSF : bascule le formulaire en saisie libre.
 * N'est jamais enregistrée — le champ `codeNsf` reçoit alors le texte saisi.
 */
export const NSF_FREE_ENTRY = '__saisie_libre__';

/**
 * Sous-ensemble de codes NSF courants (nomenclature de 1994, arrêté du 09/02/1994).
 * Elle ne comporte aucune spécialité « intelligence artificielle » ni
 * « automatisation » : l'usage les rattache à 326 (informatique) ou 201
 * (technologies de commande / automatismes). D'où le 999 hors nomenclature et
 * la saisie libre, pour les formations que rien ne décrit correctement.
 */
export const NSF_CODES = [
  { value: '', label: '— Non renseigné —' },
  { value: '100', label: '100 — Formations générales' },
  { value: '110', label: '110 — Spécialités pluriscientifiques' },
  { value: '114', label: '114 — Mathématiques' },
  { value: '120', label: '120 — Spécialités pluridisciplinaires sciences humaines' },
  { value: '136', label: '136 — Langues vivantes, civilisations' },
  { value: '200', label: '200 — Technologies industrielles fondamentales' },
  { value: '201', label: '201 — Technologies de commande (automatismes, robotique)' },
  { value: '250', label: '250 — Spécialités pluritechnologiques mécanique-électricité' },
  { value: '255', label: '255 — Électricité, électronique' },
  { value: '300', label: '300 — Spécialités plurivalentes des services' },
  { value: '310', label: '310 — Spécialités plurivalentes des échanges et gestion' },
  { value: '311', label: '311 — Transport, manutention, magasinage' },
  { value: '312', label: '312 — Commerce, vente' },
  { value: '313', label: '313 — Finances, banque, assurances' },
  { value: '314', label: '314 — Comptabilité, gestion' },
  { value: '315', label: '315 — Ressources humaines, gestion du personnel' },
  { value: '320', label: '320 — Spécialités plurivalentes communication / information' },
  { value: '321', label: '321 — Journalisme, communication' },
  { value: '324', label: '324 — Secrétariat, bureautique' },
  { value: '326', label: '326 — Informatique, traitement de l’information (IA, data)' },
  { value: '330', label: '330 — Spécialités plurivalentes sanitaires et sociales' },
  { value: '413', label: '413 — Développement des capacités comportementales' },
  { value: '415', label: '415 — Développement des capacités individuelles d’organisation' },
  { value: '999', label: '999 — Autres spécialités (hors nomenclature)' },
  { value: NSF_FREE_ENTRY, label: 'Saisie libre…' },
] as const satisfies readonly Option[];


/** Catégories de stagiaires (BPF Cerfa 10443*17, cadre pédagogique). */
export const TRAINEE_CATEGORIES = [
  { value: 'salarie', label: 'Salariés (financement employeur / OPCO)' },
  { value: 'demandeur_emploi', label: "Personnes en recherche d'emploi" },
  { value: 'particulier', label: 'Particuliers à leurs propres frais' },
  { value: 'apprenti', label: 'Apprentis' },
  { value: 'autre', label: 'Autres stagiaires' },
] as const satisfies readonly Option[];
