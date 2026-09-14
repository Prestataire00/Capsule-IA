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
