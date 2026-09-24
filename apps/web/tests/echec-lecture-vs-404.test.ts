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

/**
 * `const { data } = await …maybeSingle();` suivi d'un `notFound()` sec.
 *
 * Première forme du motif, la plus littérale : la garde suit immédiatement la
 * lecture.
 */
const AVEUGLE = /const \{ data(?::\s*\w+)? \} = await[\s\S]{0,700}?\.maybeSingle\(\);\s*\n\s*if \(![\w.]+\) notFound\(\);/;

/**
 * Le même défaut, à travers un alias.
 *
 * La plupart des pages ne testent pas `data` mais un cast intermédiaire —
 * `const c = cRow as any; if (!c) notFound();`. La garde est alors loin de sa
 * lecture, et le détecteur littéral ne la voyait pas : un relevé du 21/09/2026
 * annonçait 17 pages hors de portée. Le tri du 22/09 en a retenu dix
 * réellement fautives, toutes de cette forme, désormais corrigées.
 *
 * On suit donc l'assignation : une destructuration sans `error`, puis les noms
 * qui en dérivent, puis les `notFound()` qui les testent.
 */
function fautivesParAlias(src: string): string[] {
  const sansErreur = new Set<string>();
  for (const m of src.matchAll(/\{\s*data(?::\s*(\w+))?([^}]*)\}\s*=/g)) {
    if ((m[2] ?? '').includes('error')) continue;
    sansErreur.add(m[1] ?? 'data');
  }
  // `const c = cRow as any;` — trois passes suffisent aux chaînes réelles.
  for (let i = 0; i < 3; i += 1) {
    for (const m of src.matchAll(/const (\w+) = (\w+)\b/g)) {
      if (m[2] && sansErreur.has(m[2]) && m[1]) sansErreur.add(m[1]);
    }
  }
  const gardes = [...src.matchAll(/if \([^)]*?!(\w+)[^)]*\)\s*(?:\{\s*)?(?:return )?notFound\(\)/g)]
    .map((m) => m[1])
    .filter((n): n is string => Boolean(n));
  return [...new Set(gardes.filter((n) => sansErreur.has(n)))];
}

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

  it('aucune page ne le fait non plus à travers un cast intermédiaire', () => {
    const fautives = FICHIERS.map((f) => [path.relative(APP, f), fautivesParAlias(fs.readFileSync(f, 'utf-8'))] as const)
      .filter(([, v]) => v.length > 0)
      .map(([rel, v]) => `${rel} (${v.join(', ')})`);
    expect(
      fautives,
      'ces pages testent le résultat d’une lecture dont l’erreur a été jetée',
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
      // Et le test d'absence vient APRÈS celui de la panne : l'inverse
      // masquerait l'erreur derrière un 404. On compare au dernier
      // `notFound()` — celui de la donnée ; une page peut en avoir un plus
      // haut pour l'authentification, et la lecture peut vivre dans un
      // `Promise.all`, ce qui l'éloigne de sa garde sans rien changer à
      // l'ordre qui compte.
      //
      // Une liste n'a pas de `notFound()` : son absence de résultat est un
      // résultat. La garde y sert à ne pas annoncer « aucun dossier » quand la
      // requête a échoué — c'est ce qui a fait croire à Laurie, le 21/09/2026,
      // que ses dossiers avaient disparu. Rien à ordonner dans ce cas.
      if (!src.includes('notFound()')) continue;
      expect(src.lastIndexOf('notFound()'), rel).toBeGreaterThan(src.indexOf('if (erreurLecture)'));
    }
  });
});
