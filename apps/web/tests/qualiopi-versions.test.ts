// La V10 du référentiel (décret 2026-728) prend effet le 1er novembre 2026 :
// jusque-là la V9 reste celle auditée, et l'ancien jeu ne revient jamais.
import { describe, it, expect } from 'vitest';
import { enVigueur, jourParis, versions, type VersionRow } from '@/features/qualiopi/referentiel';

const V9: VersionRow = { referential_version: 'v9', effective_from: null, effective_until: '2026-10-31' };
const V10: VersionRow = { referential_version: 'v10', effective_from: '2026-11-01', effective_until: null };
const LEGACY: VersionRow = { referential_version: 'legacy', effective_from: null, effective_until: null };

describe('versions du référentiel Qualiopi', () => {
  it('bascule de la V9 à la V10 au 1er novembre 2026', () => {
    expect(enVigueur(V9, '2026-10-31')).toBe(true);
    expect(enVigueur(V10, '2026-10-31')).toBe(false);
    expect(enVigueur(V9, '2026-11-01')).toBe(false);
    expect(enVigueur(V10, '2026-11-01')).toBe(true);
  });

  it('annonce la V10 tant qu’elle n’est pas en vigueur', () => {
    expect(versions([LEGACY, V9, V10], '2026-09-11')).toEqual({
      courante: 'v9',
      suivante: { version: 'v10', from: '2026-11-01' },
    });
    expect(versions([LEGACY, V9, V10], '2026-11-02')).toEqual({ courante: 'v10', suivante: null });
  });

  it('n’affiche jamais l’ancien jeu, même seul', () => {
    expect(versions([LEGACY], '2026-09-11').courante).toBeNull();
  });

  it('date le jour à l’heure de Paris', () => {
    // 31 octobre, 23 h 30 UTC = 1er novembre, 0 h 30 à Paris (heure d'hiver).
    expect(jourParis(new Date('2026-10-31T23:30:00Z'))).toBe('2026-11-01');
  });
});
