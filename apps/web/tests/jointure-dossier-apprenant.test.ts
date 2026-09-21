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

/**
 * Chaque mention d'apprenants, avec le texte qui la précède.
 *
 * On ne découpe plus par `.select(...)` : un select écrit en deux littéraux
 * concaténés (`'a, ' + 'learner:learners(...)'`) échappait à cette lecture, et
 * c'est précisément ce qui a laissé passer six jointures — dont celle de la
 * fiche d'un dossier, qui renvoyait « introuvable » en production le
 * 21/09/2026. On regarde donc le texte brut autour de chaque occurrence.
 */
function mentionsApprenants(src: string): { avant: string; hint: boolean }[] {
  const out: { avant: string; hint: boolean }[] = [];
  const re = /(?<!dossier_)\blearners(!?[A-Za-z_]*)\(/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    out.push({
      avant: src.slice(Math.max(0, m.index - 400), m.index),
      hint: (m[1] ?? '').includes('dossiers_learner_id_fkey'),
    });
  }
  return out;
}

/** La mention part-elle d'un dossier — directement, ou par imbrication ? */
const depuisUnDossier = (avant: string): boolean =>
  /\.from\(\s*'dossiers'\s*\)/.test(avant) || /\bdossiers\(/.test(avant);

describe('jointures entre dossiers et apprenants', () => {
  it('le dépôt en contient bien (le détecteur n’est pas muet)', () => {
    const total = FICHIERS.flatMap((f) => mentionsApprenants(fs.readFileSync(f, 'utf-8'))).filter((m) =>
      depuisUnDossier(m.avant),
    );
    expect(total.length).toBeGreaterThan(25);
  });

  it('nomment toutes la clé étrangère visée', () => {
    const fautives: string[] = [];
    for (const f of FICHIERS) {
      for (const m of mentionsApprenants(fs.readFileSync(f, 'utf-8'))) {
        if (depuisUnDossier(m.avant) && !m.hint) fautives.push(path.relative(RACINE, f));
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

// Un 404 est une réponse : « j'ai cherché, il n'y a rien ». Quand la recherche
// elle-même échoue, le dire — sinon l'écran affirme qu'un dossier n'existe pas
// alors qu'il vient d'être créé (incident du 21/09/2026).
describe('erreur de lecture contre dossier absent', () => {
  const layout = fs.readFileSync(
    path.join(RACINE, 'app/(dashboard)/dossiers/[id]/layout.tsx'),
    'utf-8',
  );

  it('la fiche du dossier ne jette plus l’erreur de sa requête', () => {
    expect(layout).toContain('const { data, error } = await sb');
    expect(layout).toMatch(/if \(error\) \{[\s\S]{0,200}throw new Error/);
  });

  it('et distingue toujours le dossier réellement absent', () => {
    expect(layout).toContain('if (!data) notFound();');
    expect(layout.indexOf('if (error)')).toBeLessThan(layout.indexOf('if (!data) notFound();'));
  });
});
