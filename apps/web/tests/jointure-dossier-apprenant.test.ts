// Depuis la 0175, deux chemins relient `app.dossiers` et `app.learners` : le
// titulaire (`dossiers.learner_id`) et le groupe (`dossier_learners`).
// PostgREST refuse alors toute jointure imbriquée qui ne dit pas lequel elle
// veut, avec l'erreur PGRST201 « more than one relationship was found ».
//
// Constat de la recette du 20/09/2026 : 31 requêtes étaient dans ce cas —
// convocation, attestation, certificat, facture, export Qualiopi, émargement,
// questionnaires. Toutes échouaient en production dès que la 0175 a été
// appliquée. Ce test interdit qu'une nouvelle s'ajoute.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const RACINE = path.resolve(__dirname, '..');
const DOSSIERS = ['app', 'features', 'shared'];

function sources(dir: string): string[] {
  const out: string[] = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...sources(p));
    else if (/\.tsx?$/.test(e.name)) out.push(p);
  }
  return out;
}

const FICHIERS = DOSSIERS.flatMap((d) => sources(path.join(RACINE, d)));

/** Chaque `.from('X')` suivi de son `.select('…')`. */
function requetes(src: string): { table: string; select: string }[] {
  const out: { table: string; select: string }[] = [];
  const re = /\.from\(\s*'([a-z_]+)'\s*\)([\s\S]{0,400}?)\.select\(\s*(['"`])([\s\S]*?)\3/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) out.push({ table: m[1] ?? '', select: m[4] ?? '' });
  return out;
}

describe('jointures entre dossiers et apprenants', () => {
  it('le dépôt en contient bien (le détecteur n’est pas muet)', () => {
    // `learners(` a disparu au profit de `learners!…(` : on compte donc
    // toute mention d'apprenants dans une requête partant d'un dossier.
    const total = FICHIERS.flatMap((f) => requetes(fs.readFileSync(f, 'utf-8'))).filter(
      (q) => q.table === 'dossiers' && /(?<!dossier_)\blearners[!(]/.test(q.select),
    );
    expect(total.length).toBeGreaterThan(15);
  });

  it('nomment toutes la clé étrangère visée', () => {
    const fautives: string[] = [];
    for (const f of FICHIERS) {
      const src = fs.readFileSync(f, 'utf-8');
      for (const q of requetes(src)) {
        if (q.table !== 'dossiers') continue;
        // `dossier_learners(` est une autre table : elle n'est pas ambiguë.
        const ambigu = /(?<!dossier_)\blearners\(/.test(q.select) && !q.select.includes('!dossiers_learner_id_fkey');
        if (ambigu) fautives.push(path.relative(RACINE, f));
      }
    }
    expect(
      [...new Set(fautives)],
      'jointures ambiguës : PostgREST renverra PGRST201 en production',
    ).toEqual([]);
  });

  it('la clé nommée est celle du titulaire, pas celle du groupe', () => {
    // `dossier_learners` a ses propres clés : viser l'une d'elles changerait
    // la cardinalité et ramènerait plusieurs apprenants là où le code en
    // attend un seul.
    const src = fs.readFileSync(path.join(RACINE, 'features/documents/build-convocation-pdf.ts'), 'utf-8');
    expect(src).toContain('learners!dossiers_learner_id_fkey(');
    expect(src).not.toContain('dossier_learners_learner_id_fkey');
  });
});
