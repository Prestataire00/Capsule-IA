// Un secret dans une URL est un secret journalisé : Railway, le proxy,
// l'historique du navigateur et l'en-tête Referer de la page suivante le
// recopient tous. Comme CRON_SECRET est partagé par les crons ET par les
// endpoints d'administration, sa fuite donnait l'écriture sur toute la base.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const API = path.resolve(__dirname, '../app/api');

function routes(dir: string): string[] {
  const out: string[] = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...routes(p));
    else if (e.name === 'route.ts') out.push(p);
  }
  return out;
}

const TOUTES = routes(API);
const relatif = (p: string) => path.relative(API, p);

describe('secret machine (CRON_SECRET)', () => {
  it('aucune route ne lit le secret dans la query string', () => {
    const fautives = TOUTES.filter((p) => {
      const src = fs.readFileSync(p, 'utf-8');
      return /searchParams\.get\(\s*['"]secret['"]\s*\)/.test(src);
    }).map(relatif);
    expect(fautives, `secret en query string : ${fautives.join(', ')}`).toEqual([]);
  });

  it('aucune route ne compare le secret avec === (temps non constant)', () => {
    const fautives = TOUTES.filter((p) => {
      const src = fs.readFileSync(p, 'utf-8');
      return /===\s*`?Bearer \$\{?env\.CRON_SECRET|===\s*env\.CRON_SECRET/.test(src);
    }).map(relatif);
    expect(fautives, `comparaison non constante : ${fautives.join(', ')}`).toEqual([]);
  });

  it('les crons passent tous par le helper commun', () => {
    const crons = TOUTES.filter((p) => relatif(p).startsWith('cron/'));
    expect(crons.length).toBeGreaterThanOrEqual(4);
    for (const p of crons) {
      const src = fs.readFileSync(p, 'utf-8');
      const propre = /verifierSecretMachine/.test(src) || /timingSafeEqual/.test(src);
      expect(propre, `${relatif(p)} n’utilise ni le helper ni timingSafeEqual`).toBe(true);
    }
  });

  it('le helper ne lit que des en-têtes', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../shared/lib/http/cron-auth.ts'), 'utf-8');
    expect(src).toContain('timingSafeEqual');
    expect(src).toContain("headers.get('Authorization')");
    expect(src).not.toContain('searchParams');
  });
});

describe('la route de peuplement de démonstration', () => {
  const src = fs.readFileSync(path.resolve(API, 'admin/seed-demo/route.ts'), 'utf-8');

  it('est fermée en production', () => {
    // Elle écrit de fausses données avec la clé service role, et son ?org=
    // vise une organisation cliente réelle.
    expect(src).toContain("env.NODE_ENV !== 'production'");
    expect(src).toContain('not_available_in_production');
  });

  it('protège aussi bien la lecture que l’écriture', () => {
    expect(src.match(/indisponibleEnProduction\(\)/g)?.length).toBeGreaterThanOrEqual(3);
    expect(src.match(/verifierSecretMachine\(req\)/g)?.length).toBe(2);
  });
});
