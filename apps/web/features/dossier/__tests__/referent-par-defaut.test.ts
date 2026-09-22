import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  decouperNom,
  memeContact,
  referentParDefaut,
  type ContactConnu,
} from '../referent-par-defaut';

const contact = (over: Partial<ContactConnu> & { id: string }): ContactConnu => ({
  firstName: null,
  lastName: null,
  email: null,
  ...over,
});

describe('découpage du nom saisi en une ligne', () => {
  it('sépare prénom et nom', () => {
    expect(decouperNom('Jean Dupont')).toEqual({ firstName: 'Jean', lastName: 'Dupont' });
  });

  it('garde les noms composés entiers', () => {
    expect(decouperNom('Marie-Claire Dupont du Pré')).toEqual({
      firstName: 'Marie-Claire',
      lastName: 'Dupont du Pré',
    });
  });

  it('met un nom seul du côté du nom de famille', () => {
    expect(decouperNom('Dupont')).toEqual({ firstName: '', lastName: 'Dupont' });
  });

  it('absorbe les espaces en trop', () => {
    expect(decouperNom('  Jean   Dupont  ')).toEqual({ firstName: 'Jean', lastName: 'Dupont' });
  });

  it('ne rend rien pour une saisie vide', () => {
    expect(decouperNom('')).toBeNull();
    expect(decouperNom('   ')).toBeNull();
    expect(decouperNom(null)).toBeNull();
  });
});

describe('reconnaître un contact déjà enregistré', () => {
  it('se fie à l’e-mail quand les deux en ont un', () => {
    const c = contact({ id: 'c1', firstName: 'Jean', lastName: 'Dupont', email: 'j.dupont@acme.fr' });
    expect(memeContact(c, { nom: { firstName: 'Autre', lastName: 'Nom' }, email: 'J.Dupont@ACME.fr' })).toBe(true);
  });

  it('distingue deux homonymes qui ont des adresses différentes', () => {
    const c = contact({ id: 'c1', firstName: 'Jean', lastName: 'Dupont', email: 'jean@acme.fr' });
    expect(memeContact(c, { nom: { firstName: 'Jean', lastName: 'Dupont' }, email: 'jd@acme.fr' })).toBe(false);
  });

  it('se rabat sur le nom quand une adresse manque', () => {
    const c = contact({ id: 'c1', firstName: 'Jean', lastName: 'Dupont' });
    expect(memeContact(c, { nom: { firstName: 'Jean', lastName: 'Dupont' }, email: null })).toBe(true);
  });

  it('ignore accents et casse sur le nom', () => {
    const c = contact({ id: 'c1', firstName: 'Hélène', lastName: 'Léger' });
    expect(memeContact(c, { nom: { firstName: 'helene', lastName: 'LEGER' }, email: null })).toBe(true);
  });

  it('ne rapproche jamais deux contacts sans nom ni adresse', () => {
    const c = contact({ id: 'c1' });
    expect(memeContact(c, { nom: { firstName: '', lastName: '' }, email: null })).toBe(false);
  });
});

describe('le référent posé à la création', () => {
  it('prend celui qui commande la formation', () => {
    expect(
      referentParDefaut({
        commanditaire: { nom: 'Jean Dupont', email: 'j.dupont@acme.fr', phone: '0102030405' },
        contacts: [],
      }),
    ).toEqual({
      action: 'creer',
      nom: { firstName: 'Jean', lastName: 'Dupont' },
      email: 'j.dupont@acme.fr',
      phone: '0102030405',
    });
  });

  it('réutilise le contact quand cette personne est déjà connue', () => {
    // Sans cela, chaque dossier du même client créerait un doublon de plus.
    const connu = contact({ id: 'c1', firstName: 'Jean', lastName: 'Dupont', email: 'j.dupont@acme.fr' });
    expect(
      referentParDefaut({
        commanditaire: { nom: 'Jean Dupont', email: 'j.dupont@acme.fr', phone: null },
        contacts: [connu],
      }),
    ).toEqual({ action: 'designer', contactId: 'c1' });
  });

  it('n’écrase JAMAIS un référent déjà choisi', () => {
    expect(
      referentParDefaut({
        dejaDesigne: 'choisi-a-la-main',
        commanditaire: { nom: 'Quelqu’un d’autre', email: 'autre@acme.fr', phone: null },
        contacts: [contact({ id: 'c1', isPrimary: true })],
      }),
    ).toEqual({ action: 'designer', contactId: 'choisi-a-la-main' });
  });

  it('retombe sur le contact principal du client quand personne n’est nommé', () => {
    expect(
      referentParDefaut({
        commanditaire: null,
        contacts: [contact({ id: 'c1' }), contact({ id: 'c2', isPrimary: true })],
      }),
    ).toEqual({ action: 'designer', contactId: 'c2' });
  });

  it('prend le premier contact à défaut de principal désigné', () => {
    expect(referentParDefaut({ contacts: [contact({ id: 'c1' }), contact({ id: 'c2' })] })).toEqual({
      action: 'designer',
      contactId: 'c1',
    });
  });

  it('ne désigne personne quand le client n’a aucun contact', () => {
    // Le dossier retombe alors sur les coordonnées de l'entreprise.
    expect(referentParDefaut({ commanditaire: null, contacts: [] })).toEqual({ action: 'aucun' });
    expect(referentParDefaut({})).toEqual({ action: 'aucun' });
  });

  it('ignore un commanditaire sans nom mais avec une adresse', () => {
    // `contacts` exige un nom : créer « (sans nom) » ne rendrait service à personne.
    expect(
      referentParDefaut({
        commanditaire: { nom: '  ', email: 'anonyme@acme.fr', phone: null },
        contacts: [],
      }),
    ).toEqual({ action: 'aucun' });
  });
});

describe('le défaut de la case « suit aussi la formation »', () => {
  it('est décochée : on n’inscrit personne comme stagiaire sans l’avoir dit', () => {
    // Demande d'Ismael du 2026-09-22 : celui qui commande ne doit pas être
    // compté d'office parmi les stagiaires. Le défaut vit dans le schéma de la
    // demande ; ce test le verrouille, parce qu'un `true` y passerait inaperçu.
    const schema = readFileSync(
      join(__dirname, '../../../app/(dashboard)/prospects/nouvelle/schema.ts'),
      'utf8',
    );
    expect(schema).toContain('candidateIsLearner: z.boolean().default(false)');
  });
});

describe('le commanditaire reste sur son dossier', () => {
  it('reste le titulaire, il n’est simplement pas compté parmi les stagiaires', () => {
    // Version précédente : on le sortait du dossier au profit d'un titulaire
    // provisoire, ce qui obligeait à exiger une entreprise pour avoir où le
    // ranger. Il reste titulaire et référent ; seul son décompte change.
    const conversion = readFileSync(
      join(__dirname, '../../../features/crm/prospect-conversion/convert-core.ts'),
      'utf8',
    );
    expect(conversion).toContain('holder_is_learner: candidatSuitLaFormation');
    expect(conversion).not.toContain('titulaireProvisoire');
  });

  it('écrit le référent hors de save_dossier, qui l’ignorerait', () => {
    // `save_dossier` a une liste de colonnes figée : `contact_id` passé dans
    // son payload ne serait jamais enregistré.
    const conversion = readFileSync(
      join(__dirname, '../../../features/crm/prospect-conversion/convert-core.ts'),
      'utf8',
    );
    expect(conversion).toContain('contact_id: contactId');
    expect(conversion).toContain(".from('dossiers')");
  });
});
