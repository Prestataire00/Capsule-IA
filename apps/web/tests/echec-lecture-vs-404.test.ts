// Un 404 est une réponse : « j'ai cherché, il n'y a rien ». Quand la recherche
// elle-même a échoué, il faut le dire.
//
// Neuf pages écrivaient `const { data } = await …; if (!data) notFound();`, en
// jetant l'erreur de la requête. Toute panne — jointure ambiguë, colonne
// absente, RLS qui refuse, base injoignable — s'affichait donc comme « cette
// fiche n'existe pas ». C'est ce qui a rendu l'incident du 21/09/2026
// indéchiffrable : le dossier venait d'être créé, il existait bel et bien, et
// l'écran affirmait le contraire. Le symptôme désignait la mauvaise cause.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const APP = path.resolve(__dirname, '../app');

function pages(dir: string): string[] {
  const out: string[] = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith('.')) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...pages(p));
    else if (e.name.endsWith('.tsx')) out.push(p);
  }
  return out;
}

const FICHIERS = pages(APP);

/** `const { data } = await …maybeSingle();` suivi d'un `notFound()` sec. */
const AVEUGLE = /const \{ data(?::\s*\w+)? \} = await[\s\S]{0,700}?\.maybeSingle\(\);\s*\n\s*if \(![\w.]+\) notFound\(\);/;

describe('échec de lecture contre ligne absente', () => {
  it('le dépôt contient bien des lectures obligatoires', () => {
    const avecNotFound = FICHIERS.filter((f) => fs.readFileSync(f, 'utf-8').includes('notFound()'));
    expect(avecNotFound.length).toBeGreaterThan(5);
  });

  it('aucune page ne transforme une panne en « introuvable »', () => {
    const fautives = FICHIERS.filter((f) => AVEUGLE.test(fs.readFileSync(f, 'utf-8'))).map((f) =>
      path.relative(APP, f),
    );
    expect(
      fautives,
      'ces pages jettent l’erreur de leur requête : une panne s’y affichera en 404',
    ).toEqual([]);
  });

  it('les pages gardées signalent la panne avant de conclure à l’absence', () => {
    const gardees = FICHIERS.filter((f) => fs.readFileSync(f, 'utf-8').includes('erreurLecture'));
    expect(gardees.length).toBeGreaterThanOrEqual(8);
    for (const f of gardees) {
      const src = fs.readFileSync(f, 'utf-8');
      const rel = path.relative(APP, f);
      // L'erreur remonte, elle n'est pas seulement journalisée.
      expect(src, rel).toMatch(/if \(erreurLecture\) \{[\s\S]{0,300}throw new Error/);
      // Et la garde suit immédiatement la lecture : intercaler le test
      // d'absence masquerait la panne. On ne compare pas à `notFound()` en
      // général — une page peut en avoir un plus haut, pour l'authentification.
      expect(src, rel).toMatch(/\.maybeSingle\(\);\s*(?:\n\s*\/\/[^\n]*)*\s*\n\s*if \(erreurLecture\)/);
    }
  });
});
