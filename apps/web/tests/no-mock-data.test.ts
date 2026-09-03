// Garde-fou anti-régression : des données de démonstration servies comme des
// mesures sont indiscernables de vraies données pour l'utilisateur, et bien
// plus trompeuses qu'une page vide.
//
// Le module `shared/mock/data.ts` alimentait, en production et pour tous les
// organismes : les « dossiers récents » de l'accueil (Alice Martin, Bob
// Durand…), les « Récents » de la barre latérale, le journal d'audit — et,
// plus grave, une voie de repli qui déposait une VRAIE réclamation au nom
// d'une apprenante fictive dans la première organisation de la base.
//
// Il a été supprimé le 2026-09-03 (CAP-28). Ce test empêche qu'un module
// équivalent réapparaisse dans le code servi.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const RACINE = path.resolve(__dirname, '..');
const SOURCES = ['app', 'features', 'shared'].map((d) => path.join(RACINE, d));

function fichiers(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) fichiers(p, out);
    else if (/\.tsx?$/.test(e.name) && !e.name.includes('.test.') && !p.includes('__tests__')) out.push(p);
  }
  return out;
}

describe('données de démonstration', () => {
  it('aucun module de données fictives n’est importé par le code servi', () => {
    const fautifs: string[] = [];
    for (const dossier of SOURCES) {
      for (const f of fichiers(dossier)) {
        const src = fs.readFileSync(f, 'utf-8');
        if (/from '@\/shared\/mock/.test(src) || /from '.*\/mock\/data'/.test(src)) {
          fautifs.push(path.relative(RACINE, f));
        }
      }
    }
    expect(fautifs, 'ces écrans afficheraient des données inventées comme de vraies mesures').toEqual([]);
  });

  it('les noms du jeu de démonstration ne subsistent nulle part', () => {
    const noms = ['Alice Martin', 'Bob Durand', 'Cécile Da Silva', 'Sophie Bernard'];
    const fautifs: string[] = [];
    for (const dossier of SOURCES) {
      for (const f of fichiers(dossier)) {
        const src = fs.readFileSync(f, 'utf-8');
        if (noms.some((n) => src.includes(n))) fautifs.push(path.relative(RACINE, f));
      }
    }
    expect(fautifs).toEqual([]);
  });
});
