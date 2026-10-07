// Derrière le proxy de Railway, l'adresse de la requête est l'adresse interne
// du serveur (https://localhost:5000) : une redirection fondée dessus envoie le
// client sur localhost. Le bouton « Signer » de l'espace entreprise l'a fait
// le 07/10/2026. Toute redirection passe par publicOrigin().
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const racine = resolve(__dirname, '../app');
const fichiers = (dir: string): string[] =>
  readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? fichiers(p) : /\.(ts|tsx)$/.test(n) ? [p] : [];
  });

describe('les redirections visent l’adresse publique', () => {
  it('aucune redirection construite sur l’adresse interne de la requête', () => {
    const fautifs = fichiers(racine).filter((f) =>
      /redirect\(\s*new URL\([^)]*,\s*(req|request)\.(url|nextUrl\.origin)\s*\)/.test(readFileSync(f, 'utf8')),
    );
    expect(fautifs).toEqual([]);
  });
});
