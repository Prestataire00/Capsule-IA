import { describe, it, expect } from 'vitest';
import { formateursRetenus, invitesVisio, referentDuDossier, rappelDu } from './invites-visio';

describe('formateursRetenus', () => {
  it('prend les formateurs de la séance en priorité', () => {
    expect(formateursRetenus({ seance: ['t1'], dossiers: ['t2'], formation: 't3' })).toEqual(['t1']);
  });
  it('se replie sur le dossier, puis sur la formation', () => {
    expect(formateursRetenus({ seance: [], dossiers: ['t2', 't2'], formation: 't3' })).toEqual(['t2']);
    expect(formateursRetenus({ seance: [], dossiers: [], formation: 't3' })).toEqual(['t3']);
    expect(formateursRetenus({ seance: [], dossiers: [], formation: null })).toEqual([]);
  });
});

describe('invitesVisio', () => {
  it('réunit stagiaires et formateur sans doublon ni adresse vide', () => {
    expect(
      invitesVisio(['a@x.fr', null, ' B@x.fr ', 'titulaire@import.invalid'], ['b@x.fr', 'formateur@x.fr', '', 'pas-une-adresse']),
    ).toEqual(['a@x.fr', 'B@x.fr', 'formateur@x.fr']);
  });
});

describe('referentDuDossier', () => {
  it('le référent du dossier passe avant le contact de l’entreprise', () => {
    expect(referentDuDossier({ referentEmail: 'rh@client.fr', companyEmail: 'contact@client.fr' })).toBe('rh@client.fr');
  });
  it('sans référent joignable, le contact de l’entreprise', () => {
    expect(referentDuDossier({ referentEmail: 'x@import.invalid', companyEmail: 'contact@client.fr' })).toBe(
      'contact@client.fr',
    );
    expect(referentDuDossier({})).toBeNull();
  });
});

describe('rappelDu', () => {
  const debut = '2026-10-10T09:00:00.000Z';
  const avant = (heures: number) => new Date(new Date(debut).getTime() - heures * 3600_000);

  it('rappel à 48 h entre 48 h et 24 h avant', () => {
    expect(rappelDu(debut, avant(48))).toBe('48h');
    expect(rappelDu(debut, avant(47.8))).toBe('48h');
    expect(rappelDu(debut, avant(25))).toBe('48h');
  });
  it('rien entre 24 h et 2 h, ni avant 48 h', () => {
    expect(rappelDu(debut, avant(24))).toBeNull();
    expect(rappelDu(debut, avant(10))).toBeNull();
    expect(rappelDu(debut, avant(49))).toBeNull();
  });
  it('rappel à 2 h dans les deux dernières heures, rien une fois commencée', () => {
    expect(rappelDu(debut, avant(2))).toBe('2h');
    expect(rappelDu(debut, avant(0.25))).toBe('2h');
    expect(rappelDu(debut, avant(0))).toBeNull();
  });
});
