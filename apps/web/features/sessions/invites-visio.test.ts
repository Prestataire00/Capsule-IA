import { describe, it, expect } from 'vitest';
import { formateursRetenus, invitesVisio } from './invites-visio';

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
      invitesVisio(['a@x.fr', null, ' B@x.fr '], ['b@x.fr', 'formateur@x.fr', '', 'pas-une-adresse']),
    ).toEqual(['a@x.fr', 'B@x.fr', 'formateur@x.fr']);
  });
});
