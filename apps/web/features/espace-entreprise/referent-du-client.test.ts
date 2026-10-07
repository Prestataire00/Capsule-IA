import { describe, expect, it } from 'vitest';
import { candidatsDeLaDemande, choisirReferent, decouperNom, type Candidat, type ContactClient } from './referent-du-client';

const c = (id: string, email: string | null, principal = false): ContactClient => ({ id, prenom: null, nom: id, email, principal });
const demande: Candidat = { nom: 'Rita Dupont', email: 'RH@client.fr', source: 'demande' };
const fiche: Candidat = { nom: 'Paul Martin', email: 'paul@client.fr', source: 'fiche_entreprise' };

describe('référent du client', () => {
  it('le contact qui porte l’adresse du premier candidat', () => {
    expect(choisirReferent([c('a', 'paul@client.fr', true), c('b', 'rh@client.fr')], [demande, fiche])).toEqual({ contact: c('b', 'rh@client.fr') });
  });
  it('un candidat suivant quand le premier n’a pas de fiche', () => {
    expect(choisirReferent([c('a', 'paul@client.fr'), c('x', null)], [demande, fiche])).toEqual({ contact: c('a', 'paul@client.fr') });
  });
  it('sinon le contact principal, sinon l’unique contact', () => {
    expect(choisirReferent([c('a', null), c('b', null, true)], [demande])).toEqual({ contact: c('b', null, true) });
    expect(choisirReferent([c('a', null)], [demande])).toEqual({ contact: c('a', null) });
  });
  it('à créer depuis le premier candidat qui a une adresse', () => {
    expect(choisirReferent([], [{ nom: 'Sans adresse', email: null, source: 'demande' }, fiche])).toEqual({ creer: fiche });
    expect(choisirReferent([c('a', null), c('b', null)], [demande])).toEqual({ creer: demande });
  });
  it('rien quand il n’y a ni contact ni candidat', () => {
    expect(choisirReferent([c('a', null), c('b', null)], [])).toBeNull();
  });
  it('découpe le nom', () => {
    expect(decouperNom('Rita de la Tour')).toEqual({ prenom: 'Rita', nom: 'de la Tour' });
    expect(decouperNom('Dupont')).toEqual({ prenom: null, nom: 'Dupont' });
  });
});


describe('interlocuteurs d’une demande', () => {
  const base = {
    first_name: 'Nohella',
    last_name: 'DEKHISSI',
    email: 'n.dekhissi@sandaya.fr',
    phone: null,
    referent_name: null,
    referent_email: null,
    referent_phone: null,
  };
  it('qui commande sans suivre la formation est le référent', () => {
    expect(candidatsDeLaDemande({ ...base, candidate_is_learner: false })[0]).toMatchObject({ nom: 'Nohella DEKHISSI', email: 'n.dekhissi@sandaya.fr', source: 'demandeur' });
  });
  it('qui suit la formation : son référent déclaré d’abord, elle à défaut', () => {
    const avecReferent = candidatsDeLaDemande({ ...base, candidate_is_learner: true, referent_name: 'Claire RH', referent_email: 'rh@sandaya.fr' });
    expect(avecReferent.map((c) => c.source)).toEqual(['demande', 'demandeur']);
    expect(candidatsDeLaDemande({ ...base, candidate_is_learner: true }).map((c) => c.email)).toEqual(['n.dekhissi@sandaya.fr']);
  });
});
