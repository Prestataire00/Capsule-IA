import { describe, expect, it } from 'vitest';
import { contactReferent, decouperNom, type ContactClient } from './referent-du-client';

const c = (id: string, email: string | null, principal = false): ContactClient => ({ id, prenom: null, nom: id, email, principal });

describe('référent du client', () => {
  it('le contact qui porte l’adresse du responsable d’abord', () => {
    expect(contactReferent([c('a', 'x@client.fr', true), c('b', 'RH@client.fr')], { nom: 'Rita', email: 'rh@client.fr ' })?.id).toBe('b');
  });
  it('sinon le contact principal, sinon l’unique contact', () => {
    expect(contactReferent([c('a', null), c('b', null, true)], { nom: null, email: null })?.id).toBe('b');
    expect(contactReferent([c('a', null)], { nom: null, email: 'autre@client.fr' })?.id).toBe('a');
  });
  it('rien à retenir parmi plusieurs contacts sans principal', () => {
    expect(contactReferent([c('a', null), c('b', null)], { nom: null, email: null })).toBeNull();
  });
  it('découpe le nom du responsable', () => {
    expect(decouperNom('Rita de la Tour')).toEqual({ prenom: 'Rita', nom: 'de la Tour' });
    expect(decouperNom('Dupont')).toEqual({ prenom: null, nom: 'Dupont' });
    expect(decouperNom('  ')).toEqual({ prenom: null, nom: null });
  });
});
