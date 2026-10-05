import { describe, it, expect } from 'vitest';
import { etatEmargement, etatQuestionnaire } from './suivi-stagiaire';

describe('etatQuestionnaire', () => {
  it('rempli, envoyé ou rien', () => {
    const a = [
      { kind: 'positionnement', status: 'completed' },
      { kind: 'satisfaction_chaud', status: 'pending' },
      { kind: 'satisfaction_froid', status: 'expired' },
    ];
    expect(etatQuestionnaire(a, 'positionnement')).toBe('rempli');
    expect(etatQuestionnaire(a, 'satisfaction_chaud')).toBe('envoye');
    expect(etatQuestionnaire(a, 'satisfaction_froid')).toBe('aucun');
    expect(etatQuestionnaire(a, 'evaluation_acquis')).toBe('aucun');
  });
});

describe('etatEmargement', () => {
  const p = (entryAt: string | null, attestedAt: string | null = null) => [
    { id: 'l1', kind: 'learner', expected: true, entryAt, attestedAt },
  ];
  const maintenant = new Date('2026-10-06T14:00:00Z').getTime();

  it('compte les demi-journées ouvertes, signées ou attestées', () => {
    expect(
      etatEmargement(
        [
          { windowStart: '2026-10-06T07:00:00Z', participants: p('2026-10-06T07:02:00Z') },
          { windowStart: '2026-10-06T12:00:00Z', participants: p(null, '2026-10-06T12:10:00Z') },
          { windowStart: '2026-10-07T07:00:00Z', participants: p(null) },
        ],
        'l1',
        maintenant,
      ),
    ).toEqual({ attendues: 2, signees: 2 });
  });

  it('une demi-journée ouverte sans signature compte comme manquante', () => {
    expect(etatEmargement([{ windowStart: '2026-10-06T07:00:00Z', participants: p(null) }], 'l1', maintenant)).toEqual({
      attendues: 1,
      signees: 0,
    });
  });
});
