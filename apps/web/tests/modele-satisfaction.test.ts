import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/env.mjs', () => ({ env: { PUBLIC_APP_URL: 'https://app.test' } }));

import { modeleSatisfaction } from '@/features/questionnaire/satisfaction';

/** Faux client : les modèles de l'organisme, puis le questionnaire intégré. */
function faux(propres: Array<{ id: string; kind: string; code: string | null; audience: string | null }>) {
  const chaine = (resultat: unknown) => {
    const q: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'is', 'in', 'neq']) q[m] = () => q;
    q.order = async () => ({ data: resultat, error: null });
    q.maybeSingle = async () => ({ data: { id: 'integre' }, error: null });
    return q;
  };
  let appel = 0;
  return { schema: () => ({ from: () => chaine(appel++ === 0 ? propres : null) }) } as never;
}

describe('le questionnaire de satisfaction de l’organisme', () => {
  it('prend le sien quand il en a un pour les stagiaires', async () => {
    const r = await modeleSatisfaction(faux([{ id: 'mien', kind: 'satisfaction_chaud', code: 'perso', audience: null }]), 'org');
    expect(r).toEqual({ id: 'mien', generique: false });
  });

  it('ignore la satisfaction entreprise et revient à l’intégré', async () => {
    const r = await modeleSatisfaction(
      faux([{ id: 'entreprise', kind: 'satisfaction_chaud', code: 'satisfaction_entreprise_x', audience: null }]),
      'org',
    );
    expect(r).toEqual({ id: 'integre', generique: true });
  });
});
