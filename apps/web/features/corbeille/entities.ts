// Corbeille commune : ce que l'on peut supprimer dans le CRM, et comment.
// Rien n'est effacé en base — on pose `deleted_at`, et la corbeille permet de
// revenir en arrière. Module pur : importable depuis un composant client.
import type { Section } from '@/shared/lib/auth/permissions';

export type EntiteDef = {
  /** Table du schéma `app`. */
  table: string;
  /** Section de la matrice de droits : il faut « manage » pour supprimer. */
  section: Section;
  /** « Supprimer {article} ? » */
  article: string;
  /** Titre du groupe dans la corbeille. */
  pluriel: string;
  /** Colonnes lues pour afficher la ligne dans la corbeille. */
  select: string;
  /** Chemins à rafraîchir après suppression ou restauration. */
  revalider: string[];
  /** Libellé d'une ligne (nom lisible). */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  libelle: (row: any) => string;
  /** Deuxième ligne, facultative (référence, e-mail…). */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  detail?: (row: any) => string | null;
};

const nomPersonne = (r: { first_name?: string | null; last_name?: string | null }) =>
  `${r.first_name ?? ''} ${r.last_name ?? ''}`.trim() || 'Sans nom';

export const ENTITES: Record<string, EntiteDef> = {
  demande: {
    table: 'prospects',
    section: 'crm',
    article: 'cette demande',
    pluriel: 'Demandes',
    select: 'id, first_name, last_name, email, deleted_at',
    revalider: ['/prospects'],
    libelle: nomPersonne,
    detail: (r) => r.email ?? null,
  },
  dossier: {
    table: 'dossiers',
    section: 'dossiers',
    article: 'ce dossier',
    pluriel: 'Dossiers',
    select: 'id, reference, status, deleted_at',
    revalider: ['/dossiers'],
    libelle: (r) => r.reference ?? 'Dossier',
    detail: (r) => r.status ?? null,
  },
  apprenant: {
    table: 'learners',
    section: 'dossiers',
    article: 'cet apprenant',
    pluriel: 'Apprenants',
    select: 'id, first_name, last_name, email, deleted_at',
    revalider: ['/apprenants'],
    libelle: nomPersonne,
    detail: (r) => r.email ?? null,
  },
  entreprise: {
    table: 'companies',
    section: 'crm',
    article: 'cette entreprise',
    pluriel: 'Entreprises',
    select: 'id, name, siret, deleted_at',
    revalider: ['/entreprises'],
    libelle: (r) => r.name ?? 'Entreprise',
    detail: (r) => (r.siret ? `SIRET ${r.siret}` : null),
  },
  formateur: {
    table: 'trainers',
    section: 'dossiers',
    article: 'ce formateur',
    pluriel: 'Formateurs',
    select: 'id, first_name, last_name, email, deleted_at',
    revalider: ['/formateurs'],
    libelle: nomPersonne,
    detail: (r) => r.email ?? null,
  },
  financeur: {
    table: 'funders',
    section: 'catalogue',
    article: 'ce financeur',
    pluriel: 'Financeurs',
    select: 'id, name, kind, deleted_at',
    revalider: ['/financeurs'],
    libelle: (r) => r.name ?? 'Financeur',
    detail: (r) => r.kind ?? null,
  },
  seance: {
    table: 'sessions',
    section: 'dossiers',
    article: 'cette séance',
    pluriel: 'Séances',
    select: 'id, title, starts_at, deleted_at',
    revalider: ['/sessions', '/planning', '/agenda'],
    libelle: (r) => r.title ?? 'Séance',
    detail: (r) =>
      r.starts_at ? new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', dateStyle: 'short' }).format(new Date(r.starts_at)) : null,
  },
  reclamation: {
    table: 'complaints',
    section: 'qualiopi',
    article: 'cette réclamation',
    pluriel: 'Réclamations',
    select: 'id, reference, subject, deleted_at',
    revalider: ['/reclamations'],
    libelle: (r) => r.subject ?? r.reference ?? 'Réclamation',
    detail: (r) => r.reference ?? null,
  },
};

export type EntiteKey = keyof typeof ENTITES;

export const estEntite = (v: string): v is EntiteKey => Object.prototype.hasOwnProperty.call(ENTITES, v);
