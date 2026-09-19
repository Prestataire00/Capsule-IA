import { describe, it, expect } from 'vitest';
import { destinatairesConvocation, mentionEntreprise } from '../convocation-destinataires';

describe('destinataires d’une convocation', () => {
  it('envoie au stagiaire ET à son entreprise', () => {
    const r = destinatairesConvocation({
      learnerEmail: 'salarie@client.fr',
      companyEmail: 'rh@client.fr',
    });
    expect(r.destinataires).toEqual(['salarie@client.fr', 'rh@client.fr']);
    expect(r.viaEntreprise).toBe(true);
    expect(r.injoignable).toBe(false);
  });

  it('n’envoie qu’au particulier, qui n’a personne derrière lui', () => {
    const r = destinatairesConvocation({ learnerEmail: 'jean@perso.fr' });
    expect(r.destinataires).toEqual(['jean@perso.fr']);
    expect(r.viaEntreprise).toBe(false);
  });

  it('atteint l’entreprise même quand le stagiaire n’a pas d’adresse', () => {
    const r = destinatairesConvocation({ learnerEmail: null, companyEmail: 'rh@client.fr' });
    expect(r.destinataires).toEqual(['rh@client.fr']);
    expect(r.viaEntreprise).toBe(true);
    expect(r.injoignable).toBe(false);
  });

  it('préfère le référent du dossier au contact générique', () => {
    const r = destinatairesConvocation({
      learnerEmail: 'salarie@client.fr',
      referentEmail: 'responsable.formation@client.fr',
      companyEmail: 'contact@client.fr',
    });
    expect(r.destinataires).toEqual(['salarie@client.fr', 'responsable.formation@client.fr']);
  });

  it('retombe sur le contact de l’entreprise si le référent n’a pas d’adresse', () => {
    const r = destinatairesConvocation({
      learnerEmail: 'salarie@client.fr',
      referentEmail: '  ',
      companyEmail: 'contact@client.fr',
    });
    expect(r.destinataires).toEqual(['salarie@client.fr', 'contact@client.fr']);
  });

  it('n’écrit jamais à une adresse en .invalid', () => {
    const r = destinatairesConvocation({
      learnerEmail: 'stagiaires-a-designer.abc@import.invalid',
      companyEmail: 'rh@client.fr',
    });
    expect(r.destinataires).toEqual(['rh@client.fr']);
  });

  it('signale qu’il n’y a personne à joindre', () => {
    const r = destinatairesConvocation({ learnerEmail: null, companyEmail: null });
    expect(r.injoignable).toBe(true);
    expect(r.destinataires).toEqual([]);
  });

  it('ne double pas l’adresse quand stagiaire et entreprise la partagent', () => {
    const r = destinatairesConvocation({ learnerEmail: 'RH@client.fr', companyEmail: 'rh@client.fr' });
    expect(r.destinataires).toEqual(['rh@client.fr']);
  });

  it('normalise la casse et les espaces', () => {
    const r = destinatairesConvocation({ learnerEmail: '  Jean@Perso.FR ' });
    expect(r.destinataires).toEqual(['jean@perso.fr']);
  });
});

describe('mention ajoutée pour l’entreprise', () => {
  it('demande la transmission quand le stagiaire n’a pas d’adresse', () => {
    expect(mentionEntreprise('Alice Dupont', true)).toMatch(/transmettre/i);
    expect(mentionEntreprise('Alice Dupont', true)).toContain('Alice Dupont');
  });

  it('explique la copie quand le stagiaire est joignable', () => {
    expect(mentionEntreprise('Alice Dupont', false)).toMatch(/en copie/i);
  });
});
