// La fiche demande plantait à l'affichage (28/09/2026) : le client Supabase du
// navigateur importait `@/env.mjs`, qui valide aussi les secrets serveur —
// absents du navigateur par construction. Toute page qui s'en servait tombait.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const racine = path.resolve(__dirname, '..');
function fichiers(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    if (e.name === 'node_modules' || e.name.startsWith('.')) return [];
    const p = path.join(dir, e.name);
    return e.isDirectory() ? fichiers(p) : /\.(ts|tsx)$/.test(e.name) ? [p] : [];
  });
}

describe('le navigateur ne lit jamais la configuration serveur', () => {
  it('aucun module « use client » n’importe @/env.mjs', () => {
    const fautifs = ['app', 'features', 'shared']
      .flatMap((d) => fichiers(path.join(racine, d)))
      .filter((f) => {
        const s = fs.readFileSync(f, 'utf-8');
        return /^\s*['"]use client['"]/.test(s) && /from ['"]@\/env(\.mjs)?['"]/.test(s);
      })
      .map((f) => path.relative(racine, f));
    expect(fautifs).toEqual([]);
  });

  it('le client Supabase du navigateur lit ses deux variables publiques par leur nom', () => {
    const s = fs.readFileSync(path.join(racine, 'shared/lib/supabase/client.ts'), 'utf-8');
    expect(s).toContain('process.env.NEXT_PUBLIC_SUPABASE_URL');
    expect(s).toContain('process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY');
  });
});
