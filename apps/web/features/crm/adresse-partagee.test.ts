import { describe, it, expect } from 'vitest';
import { alerteAdresse, memePersonne, porteurCorrespondant } from './adresse-partagee';

describe('une adresse partagée par plusieurs stagiaires', () => {
  it('même nom, accents et casse ignorés : la même personne', () => {
    expect(memePersonne({ prenom: 'Élodie', nom: 'Dupont' }, { prenom: 'elodie', nom: 'DUPONT ' })).toBe(true);
  });

  it('autre nom sur la même boîte : une autre personne', () => {
    expect(memePersonne({ prenom: 'Jean', nom: 'Martin' }, { prenom: 'Marie', nom: 'Dupont' })).toBe(false);
  });

  it('même famille, prénoms différents : deux personnes', () => {
    expect(memePersonne({ prenom: 'Jean', nom: 'Dupont' }, { prenom: 'Marie', nom: 'Dupont' })).toBe(false);
  });

  it('une fiche incomplète se regroupe plutôt que de se dédoubler', () => {
    expect(memePersonne({ prenom: 'Jean', nom: 'Dupont' }, { prenom: null, nom: 'Dupont' })).toBe(true);
    expect(memePersonne({ prenom: 'Jean', nom: '' }, { prenom: 'Marie', nom: 'Dupont' })).toBe(true);
  });

  it('l’alerte dit qui, où, et ce qui va se passer', () => {
    const porteurs = [{ id: '1', prenom: 'Marie', nom: 'Dupont', dossiers: ['DOS-2026-A'] }];
    expect(alerteAdresse('rh@acme.fr', { prenom: 'Marie', nom: 'Dupont' }, porteurs)).toMatch(/Marie Dupont \(DOS-2026-A\).*rattachée/);
    expect(alerteAdresse('rh@acme.fr', { prenom: 'Jean', nom: 'Martin' }, porteurs)).toMatch(/Jean Martin sera créé\(e\)/);
    expect(alerteAdresse('rh@acme.fr', { prenom: 'Jean', nom: 'Martin' }, [])).toBeNull();
    expect(porteurCorrespondant({ prenom: 'Jean', nom: 'Martin' }, porteurs)).toBeNull();
  });
});
