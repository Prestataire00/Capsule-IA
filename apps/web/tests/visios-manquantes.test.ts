import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));
const creer = vi.fn();
vi.mock('@/features/sessions/visio', () => ({ creerVisioDeSeance: (...a: unknown[]) => creer(...a) }));

import { creerLesVisiosManquantes } from '@/features/sessions/visios-manquantes';

/** Un faux client qui note les filtres de la requête des séances. */
function faux(lignes: Array<{ id: string }>) {
  const filtres: Array<[string, ...unknown[]]> = [];
  const q: Record<string, unknown> = {};
  for (const m of ['select', 'in', 'is', 'neq', 'gt', 'lt', 'order']) {
    q[m] = (...a: unknown[]) => {
      filtres.push([m, ...a]);
      return q;
    };
  }
  q.limit = async () => ({ data: lignes, error: null });
  const sb = { schema: () => ({ from: () => q }) };
  return { sb: sb as never, filtres };
}

describe('liens Meet créés automatiquement', () => {
  beforeEach(() => creer.mockReset());

  it('cherche les séances à distance ou hybrides, à venir, sans lien, non annulées', async () => {
    const { sb, filtres } = faux([]);
    await creerLesVisiosManquantes(sb, new Date('2026-10-07T10:00:00Z'));
    expect(filtres).toContainEqual(['in', 'modality', ['distanciel', 'hybride']]);
    expect(filtres).toContainEqual(['is', 'remote_url', null]);
    expect(filtres).toContainEqual(['neq', 'status', 'cancelled']);
    expect(filtres).toContainEqual(['gt', 'starts_at', '2026-10-07T10:00:00.000Z']);
  });

  it('crée le Meet sur l’agenda de l’organisme (aucun membre) et compte créations et échecs', async () => {
    const { sb } = faux([{ id: 's1' }, { id: 's2' }, { id: 's3' }]);
    creer.mockResolvedValueOnce('created').mockResolvedValueOnce('failed').mockResolvedValueOnce('no_calendar');
    const r = await creerLesVisiosManquantes(sb);
    expect(creer).toHaveBeenCalledWith(sb, 's1', null);
    expect(r).toEqual({ creees: 1, echecs: 1 });
  });
});
