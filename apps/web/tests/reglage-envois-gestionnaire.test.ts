import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { peutReglerLesEnvois } from '../shared/lib/auth/permissions';

describe('régler les envois automatiques', () => {
  it('direction et gestionnaire (Laurie) peuvent ; les autres non', () => {
    expect(peutReglerLesEnvois('owner')).toBe(true);
    expect(peutReglerLesEnvois('admin')).toBe(true);
    expect(peutReglerLesEnvois('gestionnaire')).toBe(true);
    for (const r of ['comptable', 'commercial', 'formateur', 'referent', null]) expect(peutReglerLesEnvois(r)).toBe(false);
  });
  it('la page et l’action lisent la même règle', () => {
    const lire = (p: string) => readFileSync(resolve(__dirname, p), 'utf8');
    expect(lire('../app/(dashboard)/emails/automatiques/actions.ts')).toContain('peutReglerLesEnvois(me.role)');
    expect(lire('../app/(dashboard)/emails/automatiques/page.tsx')).toContain('peutReglerLesEnvois(me?.role)');
  });
});
