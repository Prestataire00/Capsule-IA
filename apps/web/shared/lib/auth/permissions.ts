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
/**
 * Le rôle est-il connu de la matrice ?
 *
 * `can()` renvoie `'none'` pour toute valeur inconnue, ce qui est le bon défaut
 * pour *accorder* un accès, mais dangereux pour en *refuser* un : une garde qui
 * bloque sur `can(...) === 'none'` verrouille alors toute la plateforme dès que
 * la valeur lue n'est pas celle attendue. C'est précisément ce qui est arrivé le
 * 2026-08-30 (audit CAP-23). Un refus doit donc exiger un rôle **connu**.
 */
export function roleConnu(role: string | null | undefined): boolean {
  return !!role && role in MATRIX;
}

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
  ['/catalogue-public', 'catalogue'],
  ['/financeurs', 'catalogue'],
  ['/emargements', 'attendance'],
  ['/documents', 'qualiopi'],
  ['/questionnaires', 'qualiopi'],
  ['/reclamations', 'qualiopi'],
  ['/qualiopi', 'qualiopi'],
  ['/indicateurs', 'qualiopi'],
  ['/reporting', 'qualiopi'],
  // /notifications retiré du cloisonnement (audit 2026-08-30) : les notifications
  // sont personnelles, chaque rôle doit voir les siennes. Le mapping ne servait
  // qu'à masquer l'entrée de sidebar aux commerciaux ; avec la garde centrale il
  // les aurait purement bloqués.
  ['/dossiers', 'dossiers'],
  ['/planning', 'dossiers'],
  ['/apprenants', 'dossiers'],
  ['/formateurs', 'dossiers'],
  ['/heures-risque', 'dossiers'],
  // Ajouts 2026-08-30 (audit) : ces racines n'étaient associées à aucune section,
  // donc ni masquées dans la sidebar ni filtrables par la garde centrale.
  ['/agenda', 'dossiers'],
  ['/sessions', 'dossiers'],
  ['/emails', 'crm'],
  ['/fiches-besoin', 'qualiopi'],
  ['/amelioration-continue', 'qualiopi'],
  ['/tracabilite', 'qualiopi'],
  ['/bpf', 'billing'],
  ['/programmation', 'crm'],
  ['/rgpd', 'settings'],
];

export function sectionForPath(path: string): Section | null {
  const hit = ROUTE_SECTION.find(([prefix]) => path === prefix || path.startsWith(prefix + '/'));
  return hit ? hit[1] : null;
}
