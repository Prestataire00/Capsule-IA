import { describe, expect, it } from 'vitest';
import { additionner, compteurSignatures, type ParticipantCompte } from './compteur-signatures';

const p = (o: Partial<ParticipantCompte>): ParticipantCompte => ({
  kind: 'learner', expected: true, state: 'a_signer', entryAt: null, attestedAt: null, exitAt: null, exitAttested: false, ...o,
});

describe('signatures reçues sur attendues', () => {
  it('une signature d’entrée par personne ; la sortie est facultative ; absent : rien', () => {
    const c = compteurSignatures([
      p({ entryAt: 'x', exitAt: 'y', state: 'complet' }),
      p({ entryAt: 'x', state: 'entree_seule' }),
      p({ state: 'absent' }),
      p({ kind: 'trainer', attestedAt: 'x' }),
    ]);
    expect(c).toMatchObject({ recues: 2, attendues: 2, manquants: 0, complet: true, entrees: { recues: 2, attendues: 2 }, sorties: { recues: 1, attendues: 0 }, formateur: { recues: 1, attendues: 1 } });
  });

  it('complet quand tout est signé ou attesté', () => {
    const c = compteurSignatures([p({ attestedAt: 'x', exitAttested: true }), p({ kind: 'trainer', entryAt: 'x' })]);
    expect(c.complet).toBe(true);
    expect(additionner([c, compteurSignatures([p({})])])).toMatchObject({ recues: 1, attendues: 2, complet: false, manquants: 1 });
  });

  it('douze stagiaires et le formateur : 12/12, pas 13/12 (Sandaya, 16/10/2026)', () => {
    const douze = Array.from({ length: 12 }, () => p({ entryAt: 'x' }));
    const c = compteurSignatures([...douze, p({ kind: 'trainer', entryAt: 'x' })]);
    expect(c).toMatchObject({ recues: 12, attendues: 12, formateur: { recues: 1, attendues: 1 }, complet: true });
  });

  it('le formateur qui n’a pas signé laisse la feuille incomplète', () => {
    const c = compteurSignatures([p({ entryAt: 'x' }), p({ kind: 'trainer' })]);
    expect(c).toMatchObject({ recues: 1, attendues: 1, manquants: 1, complet: false });
  });
});
