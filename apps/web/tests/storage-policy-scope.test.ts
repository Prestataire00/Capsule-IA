// Garde-fou anti-régression : une policy de lecture sur `storage.objects` dont
// la seule condition est le nom du seau donne accès à **tous** les objets de ce
// seau, tous organismes confondus. Et pas seulement en téléchargement : la
// méthode `list()` du client Storage s'appuie sur ce même SELECT, donc les
// chemins n'ont même pas besoin d'être devinés.
//
// Failles réelles corrigées le 2026-08-31 (CAP-20) — quatre seaux privés étaient
// dans ce cas : `signatures` (images de signature manuscrite),
// `prospect-documents` (pièces jointes des prospects), `pedagogical` (supports
// de cours) et `zoom_imports` (CSV de présence, avec noms et adresses).
//
// Toute policy de lecture doit désormais borner explicitement : à l'organisation
// courante, ou à l'utilisateur courant.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const MIGRATIONS = path.resolve(__dirname, '../../../supabase/migrations');

/** Seaux dont la lecture publique est assumée (photos affichées au catalogue). */
const SEAUX_PUBLICS = new Set(['avatars', 'trainer-photos']);

/** Marqueurs acceptés comme borne d'accès. */
const BORNES = ['current_organization_id', 'auth.uid()', 'owner'];

type Policy = { readonly fichier: string; readonly corps: string };

function policiesStorage(): Map<string, Policy> {
  const actives = new Map<string, Policy>();
  const fichiers = fs.readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).sort();

  for (const fichier of fichiers) {
    const sql = fs.readFileSync(path.join(MIGRATIONS, fichier), 'utf-8');
    for (const [, nom] of sql.matchAll(/DROP POLICY (?:IF EXISTS )?"([^"]+)"\s+ON\s+storage\.objects/gi)) {
      actives.delete(nom!.toLowerCase());
    }
    for (const [, nom, corps] of sql.matchAll(/CREATE POLICY\s+"([^"]+)"\s+ON\s+storage\.objects([\s\S]*?);/gi)) {
      actives.set(nom!.toLowerCase(), { fichier, corps: corps! });
    }
  }
  return actives;
}

describe('cloisonnement des seaux de stockage', () => {
  it('aucune policy de lecture sans borne d’organisation ou d’utilisateur', () => {
    const fautives: string[] = [];

    for (const [nom, { corps }] of policiesStorage()) {
      if (!/FOR\s+(SELECT|ALL)/i.test(corps)) continue;

      const seau = corps.match(/bucket_id\s*=\s*'([\w-]+)'/)?.[1];
      if (seau && SEAUX_PUBLICS.has(seau)) continue;

      if (!BORNES.some((b) => corps.includes(b))) fautives.push(`${nom} (seau ${seau ?? '?'})`);
    }

    expect(
      fautives,
      'policies de lecture sans borne : tout compte authentifié lit et liste ces objets',
    ).toEqual([]);
  });
});
