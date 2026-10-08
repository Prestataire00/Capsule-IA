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
    expect(c).toMatchObject({ recues: 3, attendues: 3, manquants: 0, complet: true, entrees: { recues: 3, attendues: 3 }, sorties: { recues: 1, attendues: 0 } });
  });

  it('complet quand tout est signé ou attesté', () => {
    const c = compteurSignatures([p({ attestedAt: 'x', exitAttested: true }), p({ kind: 'trainer', entryAt: 'x' })]);
    expect(c.complet).toBe(true);
    expect(additionner([c, compteurSignatures([p({})])])).toMatchObject({ recues: 2, attendues: 3, complet: false, manquants: 1 });
  });
});
