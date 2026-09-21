// Garde-fou anti-régression : la garde d'autorisation centrale (middleware) ne
// peut cloisonner une page que si sa racine est associée à une section dans
// `ROUTE_SECTION`. Une racine non associée n'est bloquée pour personne.
//
// Avant l'audit du 2026-08-30, dix racines du dashboard n'étaient associées à
// aucune section (/bpf, /emails, /agenda, /sessions…) : elles étaient donc
// ouvertes à tous les rôles. Ce test impose de choisir explicitement — associer
// la racine, ou la déclarer volontairement ouverte ci-dessous.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { sectionForPath } from '@/shared/lib/auth/permissions';

const DASHBOARD = path.resolve(__dirname, '../app/(dashboard)');

/** Racines délibérément accessibles à tous les rôles connectés. */
const OUVERT_A_TOUS = new Set([
  'notifications', // personnelles : chaque membre voit les siennes
  'recherche', // recherche globale, résultats déjà filtrés par la RLS
  'taches', // travail d'équipe : chaque rôle connu suit et prend des tâches (RLS bornée à l'organisation)
  // La corbeille se protège elle-même, à deux niveaux : `loadTrash` n'y montre
  // que les catégories dont le rôle a au moins la lecture
  // (`can(role, section) !== 'none'`), et la restauration exige `manage` sur la
  // section de l'élément, dans la même organisation. Elle n'expose donc rien
  // qu'un rôle ne voie déjà ailleurs, et n'autorise rien de plus.
  // La rattacher à `dossiers` ne bloquerait personne — aucun rôle de la matrice
  // n'a `dossiers: none` — et ferait croire à une protection décorative, là où
  // la vraie tient dans le chargement et dans l'action.
  'corbeille',
]);

describe('cloisonnement des racines du dashboard', () => {
  it('chaque racine est associée à une section, ou déclarée ouverte', () => {
    const roots = fs
      .readdirSync(DASHBOARD, { withFileTypes: true })
      .filter((e) => e.isDirectory() && !e.name.startsWith('_') && !e.name.startsWith('('))
      .map((e) => e.name);

    const orphelines = roots.filter(
      (r) => !OUVERT_A_TOUS.has(r) && sectionForPath(`/${r}`) === null,
    );

    expect(
      orphelines,
      'racines sans section : elles ne seront cloisonnées pour aucun rôle',
    ).toEqual([]);
  });
});

// L'exemption de `/corbeille` ci-dessus ne tient que parce que la page se
// protège elle-même. Si ces deux gardes disparaissaient, la racine redeviendrait
// ouverte à tous sans filtre — ces tests transforment donc la justification de
// l'exemption en condition vérifiable.
describe('la corbeille justifie son exemption', () => {
  const lire = (rel: string) => fs.readFileSync(path.resolve(__dirname, rel), 'utf-8');

  it('ne montre que les catégories que le rôle peut déjà voir', () => {
    const src = lire('../features/corbeille/load-trash.ts');
    expect(src).toContain("can(role, def.section) !== 'none'");
  });

  it('ne laisse restaurer que ce que le rôle peut gérer, dans son organisation', () => {
    const src = lire('../features/corbeille/actions.ts');
    expect(src).toContain("can(membre.role, def.section) !== 'manage'");
    expect(src).toContain("eq('organization_id', membre.orgId)");
  });
});
