import { describe, it, expect } from 'vitest';
import { parseListeApprenants } from '../parse-learners';

describe('lecture d’une liste de stagiaires collée', () => {
  it('lit une ligne « Prénom Nom, e-mail »', () => {
    const { apprenants } = parseListeApprenants('Nathaniel Dahan, nathaniel@france-metiers.fr');
    expect(apprenants).toEqual([
      { firstName: 'Nathaniel', lastName: 'Dahan', email: 'nathaniel@france-metiers.fr', phone: null },
    ]);
  });

  it('accepte le point-virgule et la tabulation comme séparateurs', () => {
    const pv = parseListeApprenants('Marie;Curie;marie@x.fr');
    const tab = parseListeApprenants('Marie\tCurie\tmarie@x.fr');
    expect(pv.apprenants[0]?.lastName).toBe('Curie');
    expect(tab.apprenants[0]?.email).toBe('marie@x.fr');
  });

  it('reconnaît le nom en capitales, quel que soit l’ordre des mots', () => {
    const avant = parseListeApprenants('DAHAN Nathaniel');
    const apres = parseListeApprenants('Nathaniel DAHAN');
    expect(avant.apprenants[0]).toMatchObject({ firstName: 'Nathaniel', lastName: 'DAHAN' });
    expect(apres.apprenants[0]).toMatchObject({ firstName: 'Nathaniel', lastName: 'DAHAN' });
  });

  it('isole un téléphone sans le confondre avec le nom', () => {
    const { apprenants } = parseListeApprenants('Paul Martin, paul@x.fr, 06 12 34 56 78');
    expect(apprenants[0]).toMatchObject({ firstName: 'Paul', lastName: 'Martin', phone: '06 12 34 56 78' });
  });

  it('ne prend pas un nombre court pour un téléphone', () => {
    const { apprenants } = parseListeApprenants('Paul Martin 2026');
    expect(apprenants[0]?.phone).toBeNull();
  });

  it('accepte une personne sans e-mail — il sera à compléter', () => {
    const { apprenants, rejets } = parseListeApprenants('Sophie Bertrand');
    expect(rejets).toEqual([]);
    expect(apprenants[0]).toMatchObject({ firstName: 'Sophie', lastName: 'Bertrand', email: null });
  });

  it('écarte une ligne sans nom lisible, en disant pourquoi', () => {
    const { apprenants, rejets } = parseListeApprenants('   \n0612345678\n');
    expect(apprenants).toEqual([]);
    expect(rejets).toHaveLength(1);
    expect(rejets[0]?.motif).toMatch(/nom/i);
  });

  it('n’inscrit qu’une fois une personne répétée dans le copier-coller', () => {
    const { apprenants, rejets } = parseListeApprenants(
      ['Paul Martin, paul@x.fr', 'Paul Martin, paul@x.fr'].join('\n'),
    );
    expect(apprenants).toHaveLength(1);
    expect(rejets[0]?.motif).toMatch(/déjà/i);
  });

  it('lit une liste entière sans se perdre', () => {
    const colle = [
      'DUPONT Alice;alice.dupont@france-metiers.fr;06 11 22 33 44',
      'Bob MARTIN <bob.martin@france-metiers.fr>',
      '',
      'Claire Petit',
    ].join('\n');
    const { apprenants, rejets } = parseListeApprenants(colle);
    expect(apprenants).toHaveLength(3);
    expect(apprenants.map((a) => a.lastName)).toEqual(['DUPONT', 'MARTIN', 'Petit']);
    expect(apprenants[1]?.email).toBe('bob.martin@france-metiers.fr');
    expect(rejets).toEqual([]);
  });
});
