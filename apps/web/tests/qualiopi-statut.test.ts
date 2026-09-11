// Règle de statut d'un indicateur, partagée par la page qualité et l'export.
import { describe, it, expect } from 'vitest';
import { preuvesParNumero, statutEffectif, statutsParNumero, type Profil } from '@/features/qualiopi/statut';

const TOUT: Profil = { apprentissage: true, certifiant: true, sousTraitance: true };
const RIEN: Profil = { apprentissage: false, certifiant: false, sousTraitance: false };
const COMMUN = { applies_to: null, certifying_only: false, condition: null };

describe('statut effectif d’un indicateur', () => {
  it('fait primer la saisie de l’organisme', () => {
    expect(statutEffectif(COMMUN, 'en_cours', [{ ok: true }], TOUT)).toEqual({ status: 'en_cours', auto: false });
  });

  it('écarte ce que l’organisme ne pratique pas', () => {
    expect(statutEffectif({ ...COMMUN, applies_to: ['apprentissage'] }, undefined, [], RIEN).status).toBe('non_applicable');
    expect(statutEffectif({ ...COMMUN, certifying_only: true }, undefined, [], RIEN).status).toBe('non_applicable');
    expect(statutEffectif({ ...COMMUN, condition: 'subcontracting' }, undefined, [], RIEN).status).toBe('non_applicable');
  });

  it('garde applicable un indicateur visant aussi la formation', () => {
    const i8 = { ...COMMUN, applies_to: ['action_formation', 'apprentissage'] };
    expect(statutEffectif(i8, undefined, [], RIEN).status).toBe('a_traiter');
  });

  it('ne constate la conformité que si toutes les preuves suffisent', () => {
    expect(statutEffectif(COMMUN, undefined, [{ ok: true }, { ok: false }], TOUT).status).toBe('a_traiter');
    expect(statutEffectif(COMMUN, undefined, [{ ok: true }], TOUT)).toEqual({ status: 'conforme', auto: true });
    expect(statutEffectif(COMMUN, undefined, [], TOUT).status).toBe('a_traiter');
  });
});

describe('regroupement par numéro', () => {
  const numeros = new Map([
    ['v9-23', 23],
    ['v10-23', 23],
    ['v9-1', 1],
  ]);

  it('retient la saisie la plus récente, toutes versions confondues', () => {
    const s = statutsParNumero(
      [
        { indicator_id: 'v9-23', status: 'conforme' as const, note: null, updated_at: '2026-09-01T10:00:00Z' },
        { indicator_id: 'v10-23', status: 'en_cours' as const, note: null, updated_at: '2026-11-02T10:00:00Z' },
        { indicator_id: 'inconnu', status: 'conforme' as const, note: null, updated_at: '2026-12-01T10:00:00Z' },
      ],
      numeros,
    );
    expect(s.get(23)?.status).toBe('en_cours');
    expect(s.size).toBe(1);
  });

  it('réunit les preuves d’un même numéro', () => {
    const p = preuvesParNumero(
      [
        { indicator_id: 'v9-23', id: 'a' },
        { indicator_id: 'v10-23', id: 'b' },
        { indicator_id: 'v9-1', id: 'c' },
      ],
      numeros,
    );
    expect(p.get(23)?.map((x) => x.id)).toEqual(['a', 'b']);
    expect(p.get(1)?.length).toBe(1);
  });
});
