import { describe, expect, it } from 'vitest';
import { aUneAdresse, heuresApprenant, planning, trierActions, type Action } from './espace-calculs';

describe('heures d’un apprenant', () => {
  const seances = [
    { id: 's1', dureeHeures: 7, passee: true },
    { id: 's2', dureeHeures: 3.5, passee: true },
    { id: 's3', dureeHeures: 3.5, passee: false },
  ];
  const feuilles = [
    { sheetId: 'm1', sessionId: 's1', demiJournee: 'morning' },
    { sheetId: 'a1', sessionId: 's1', demiJournee: 'afternoon' },
  ];
  it('présent le matin seulement : la moitié de la journée', () => {
    const h = heuresApprenant({ seances, feuilles, statuts: { m1: 'present', a1: 'absent' } });
    expect(h).toEqual({ prevues: 14, realisees: 3.5, presences: 1, absences: 1, seancesSansFeuille: 1 });
  });
  it('en retard ou à distance compte comme présent', () => {
    expect(heuresApprenant({ seances, feuilles, statuts: { m1: 'late', a1: 'remote' } }).realisees).toBe(7);
  });
  it('une demi-journée passée sans émargement est une absence', () => {
    expect(heuresApprenant({ seances: [seances[0]!], feuilles, statuts: { m1: 'present' } }).absences).toBe(1);
  });
});

describe('planning', () => {
  it('à venir du plus proche, passé du plus récent, par mois', () => {
    const p = planning(
      [
        { id: 'a', debut: '2026-10-08T07:00:00Z', fin: '2026-10-08T10:30:00Z' },
        { id: 'b', debut: '2026-11-02T07:00:00Z', fin: '2026-11-02T10:30:00Z' },
        { id: 'c', debut: '2026-10-01T07:00:00Z', fin: '2026-10-01T10:30:00Z' },
        { id: 'd', debut: '2026-09-20T07:00:00Z', fin: '2026-09-20T10:30:00Z' },
      ],
      new Date('2026-10-07T12:00:00Z'),
    );
    expect(p.aVenir.map((g) => [g.mois, g.seances.map((s) => s.id)])).toEqual([
      ['octobre 2026', ['a']],
      ['novembre 2026', ['b']],
    ]);
    expect(p.passees.flatMap((g) => g.seances.map((s) => s.id))).toEqual(['c', 'd']);
  });
});

describe('actions requises', () => {
  const a = (cle: string, nature: Action['nature'], urgent = false): Action => ({ cle, nature, titre: cle, detail: '', lien: null, libelleLien: null, urgent });
  it('urgences d’abord, puis signer, régler, répondre, transmettre', () => {
    expect(trierActions([a('t', 'transmettre'), a('r', 'repondre'), a('f', 'regler', true), a('s', 'signer')]).map((x) => x.cle)).toEqual(['f', 's', 'r', 't']);
  });
  it('reconnaît une adresse utilisable', () => {
    expect(aUneAdresse('lea@client.fr')).toBe(true);
    expect(aUneAdresse('x@import.invalid')).toBe(false);
    expect(aUneAdresse(null)).toBe(false);
  });
});
