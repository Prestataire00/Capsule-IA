// Garde-fou anti-régression : interroger une table qui n'existe pas ne lève
// aucune exception avec supabase-js — l'erreur part dans `{ error }`, que le
// code ignore le plus souvent, et `data` vaut `null`. La fonctionnalité meurt
// alors en silence, sans trace ni message.
//
// Défaut réel corrigé le 2026-08-30 (CAP-16) : cinq écrans interrogeaient
// `app.memberships`, table qui n'a jamais existé — la table réelle est
// `app.members`. Conséquences : la page des supports pédagogiques renvoyait 404
// pour tout le monde (d'où le « Ressources à venir » de l'espace apprenant),
// et les exercices, enregistrements de séance et l'intégration Zoom étaient
// inopérants.
//
// Le typecheck signalait bien ces cinq appels, mais noyés parmi 140 erreurs
// tenues pour du bruit de types périmés.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const RACINE = path.resolve(__dirname, '..');
const MIGRATIONS = path.resolve(RACINE, '../../supabase/migrations');
const SOURCES = ['app', 'features', 'shared'].map((d) => path.join(RACINE, d));

/** Relations connues par les migrations, tous schémas confondus. */
function relationsConnues(): Set<string> {
  const noms = new Set<string>();
  const motif =
    /CREATE\s+(?:OR\s+REPLACE\s+)?(?:MATERIALIZED\s+)?(?:TABLE|VIEW)\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:[\w]+\.)?(\w+)/gi;
  for (const f of fs.readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql'))) {
    const sql = fs.readFileSync(path.join(MIGRATIONS, f), 'utf-8');
    for (const [, nom] of sql.matchAll(motif)) noms.add(nom!.toLowerCase());
  }
  return noms;
}

function fichiers(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) fichiers(p, out);
    else if (/\.tsx?$/.test(e.name) && !e.name.includes('.test.')) out.push(p);
  }
  return out;
}

describe('tables interrogées par le code', () => {
  it('chaque .from() vise une relation créée par une migration', () => {
    const connues = relationsConnues();
    const fautifs: string[] = [];

    // `.from('x')` précédé de `.storage` vise un bucket, pas une table.
    const appel = /(\.storage\s*)?\.from\(\s*'([\w]+)'/g;

    for (const dossier of SOURCES) {
      for (const f of fichiers(dossier)) {
        const src = fs.readFileSync(f, 'utf-8');
        for (const [, storage, nom] of src.matchAll(appel)) {
          if (storage) continue;
          if (connues.has(nom!.toLowerCase())) continue;
          fautifs.push(`${path.relative(RACINE, f)} → ${nom}`);
        }
      }
    }

    expect(fautifs, 'tables absentes des migrations : la requête échouera en silence').toEqual([]);
  });
});
