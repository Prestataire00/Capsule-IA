// Redirections : jamais vers l'adresse interne du serveur (localhost derrière Railway).
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { resolvePublicOrigin } from '@/shared/lib/http/public-origin';

const lire = (rel: string) => fs.readFileSync(path.resolve(__dirname, rel), 'utf-8');
const INTERNE = 'https://localhost:5000';

describe('origine publique', () => {
  it('prend l’adresse publique configurée', () => {
    expect(resolvePublicOrigin('https://capsule-ia.up.railway.app/', new Headers(), INTERNE)).toBe('https://capsule-ia.up.railway.app');
  });

  it('sinon celle transmise par le proxy, jamais l’adresse interne', () => {
    const h = new Headers({ 'x-forwarded-host': 'capsule-ia.up.railway.app', 'x-forwarded-proto': 'https', host: 'localhost:5000' });
    expect(resolvePublicOrigin(undefined, h, INTERNE)).toBe('https://capsule-ia.up.railway.app');
  });

  it('les routes qui redirigent s’en servent', () => {
    expect(lire('../app/auth/callback/route.ts')).toContain('publicOrigin(req)');
    expect(lire('../app/auth/callback/route.ts')).not.toContain('url.origin');
    expect(lire('../app/api/espace/[token]/exercise/[exerciseId]/submit/route.ts')).toContain('publicOrigin(req)');
  });
});
