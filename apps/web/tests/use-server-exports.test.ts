// Garde-fou anti-régression : un module `'use server'` ne peut exporter que des
// fonctions asynchrones (Next.js transforme chaque export en référence d'action).
// Exporter un schéma zod, un tableau ou un objet fait échouer le rendu de tout
// écran qui importe ce module — « Application error: a server-side exception has
// occurred » sans autre indice (bug réel du 2026-08-17 sur la fiche demande et
// la fiche formateur). Les constantes et schémas partagés vont dans un module
// voisin, sans directive `'use server'`.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const WEB_ROOT = path.resolve(__dirname, '..');
const SKIP_DIRS = new Set(['node_modules', '.next', 'tests']);

// Valeurs exportées qui ne sont manifestement pas des fonctions.
// (`export const x = authActionClient…` en est une : next-safe-action renvoie
// une fonction appelable, c'est le motif standard du projet.)
const NON_FUNCTION_INITIALIZER = /^export\s+const\s+(\w+)\s*(?::[^=]+)?=\s*(z\.|\[|\{|'|"|`|\d)/gm;

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) walk(p, out);
    } else if (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) {
      out.push(p);
    }
  }
  return out;
}

describe("modules 'use server'", () => {
  it("n'exportent que des fonctions", () => {
    const offenders: string[] = [];

    for (const file of walk(WEB_ROOT)) {
      const source = fs.readFileSync(file, 'utf-8');
      if (!/^'use server'/m.test(source)) continue;

      for (const m of source.matchAll(NON_FUNCTION_INITIALIZER)) {
        offenders.push(`${path.relative(WEB_ROOT, file)} → ${m[1]}`);
      }
    }

    expect(offenders, "exports non-fonction dans un module 'use server'").toEqual([]);
  });
});
