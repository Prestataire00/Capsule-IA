// Matrice d'accès par rôle (gating UI). La RLS reste le garde-fou en base ;
// ceci pilote la visibilité des menus/pages/actions côté interface.
// Pur (aucun import serveur) → importable depuis un composant client.

export const SECTIONS = [
  'dossiers',
  'crm',
  'catalogue',
  'attendance',
  'billing',
  'qualiopi',
  'settings',
] as const;
export type Section = (typeof SECTIONS)[number];

export type Access = 'manage' | 'read' | 'none';

const ALL_MANAGE: Record<Section, Access> = {
  dossiers: 'manage',
  crm: 'manage',
  catalogue: 'manage',
  attendance: 'manage',
  billing: 'manage',
  qualiopi: 'manage',
  settings: 'manage',
};

const MATRIX: Record<string, Record<Section, Access>> = {
  owner: ALL_MANAGE,
  admin: ALL_MANAGE,
  gestionnaire: {
    dossiers: 'manage', crm: 'manage', catalogue: 'manage', attendance: 'manage',
    billing: 'manage', qualiopi: 'manage', settings: 'none',
  },
  comptable: {
    dossiers: 'read', crm: 'none', catalogue: 'read', attendance: 'none',
    billing: 'manage', qualiopi: 'read', settings: 'none',
  },
  commercial: {
    dossiers: 'read', crm: 'manage', catalogue: 'read', attendance: 'none',
    billing: 'none', qualiopi: 'none', settings: 'none',
  },
  formateur: {
    dossiers: 'read', crm: 'none', catalogue: 'read', attendance: 'manage',
    billing: 'none', qualiopi: 'read', settings: 'none',
  },
  referent: {
    dossiers: 'read', crm: 'read', catalogue: 'read', attendance: 'read',
    billing: 'read', qualiopi: 'read', settings: 'none',
  },
};

/** Niveau d'accès d'un rôle à une section (défaut : `none` pour un rôle inconnu). */
export function can(role: string | null | undefined, section: Section): Access {
  if (!role) return 'none';
  return MATRIX[role]?.[section] ?? 'none';
}

/** Section associée à une route (préfixe). `null` = pas de gating (ex. accueil). */
const ROUTE_SECTION: Array<[string, Section]> = [
  ['/parametres', 'settings'],
  ['/audit', 'settings'],
  ['/factures', 'billing'],
  ['/prospects', 'crm'],
  ['/entreprises', 'crm'],
  ['/formations', 'catalogue'],
  ['/financeurs', 'catalogue'],
  ['/emargements', 'attendance'],
  ['/documents', 'qualiopi'],
  ['/questionnaires', 'qualiopi'],
  ['/reclamations', 'qualiopi'],
  ['/qualiopi', 'qualiopi'],
  ['/reporting', 'qualiopi'],
  ['/notifications', 'qualiopi'],
  ['/dossiers', 'dossiers'],
  ['/planning', 'dossiers'],
  ['/apprenants', 'dossiers'],
  ['/formateurs', 'dossiers'],
  ['/heures-risque', 'dossiers'],
];

export function sectionForPath(path: string): Section | null {
  const hit = ROUTE_SECTION.find(([prefix]) => path === prefix || path.startsWith(prefix + '/'));
  return hit ? hit[1] : null;
}
