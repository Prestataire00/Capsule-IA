// « Je dois d'abord sélectionner pour qui est la demande : entreprise,
// particulier ou autre, et le formulaire doit s'adapter » — Ismael, 24/09/2026.
//
// Le formulaire présentait tout à tout le monde : on demandait sa situation à
// une entreprise, et un SIRET à un particulier. Le premier choix commande
// désormais la suite.
//
// Il ne s'enregistre pas : il se déduit de `situation`, qui existe déjà et que
// les écrans, le BPF et la conversion utilisent. Une colonne de plus aurait dit
// deux fois la même chose, avec le risque qu'elles se contredisent.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const FORM = fs.readFileSync(
  path.resolve(__dirname, '../app/(dashboard)/prospects/nouvelle/demande-form.client.tsx'),
  'utf-8',
);
/** Position d'un repère dans le fichier — sert à vérifier l'ordre des sections. */
const ligne = (repere: string): number => {
  const i = FORM.indexOf(repere);
  expect(i, repere).toBeGreaterThan(-1);
  return i;
};

describe('le premier choix', () => {
  it('ouvre le formulaire', () => {
    expect(ligne('Pour qui est cette demande ?')).toBeLessThan(ligne('L’entreprise cliente'));
    expect(ligne('Pour qui est cette demande ?')).toBeLessThan(ligne('Financement'));
  });

  it('offre les trois cas', () => {
    for (const t of ['Une entreprise', 'Un particulier', 'Autre']) expect(FORM).toContain(`titre: '${t}'`);
  });

  it('se relit sur une demande existante, qui n’a pas de type', () => {
    // Sans cette déduction, modifier une demande d'entreprise l'aurait
    // rouverte sur « Autre », et le bloc entreprise aurait disparu.
    expect(FORM).toContain('const typeDepuisSituation');
    expect(FORM).toContain('useState<TypeDemandeur>(() => typeDepuisSituation(form.situation))');
  });

  it('ne crée pas une colonne de plus : il pilote `situation`', () => {
    expect(FORM).toContain('situation: def.situation');
    expect(FORM).not.toMatch(/type_demandeur|typeDemandeur:/);
  });
});

describe('le formulaire s’adapte', () => {
  it('l’entreprise n’est proposée qu’à qui en a une', () => {
    expect(FORM).toContain("type === 'entreprise' ||");
  });

  it('mais reste affichée si le financement l’exige', () => {
    // Le schéma impose le SIRET dès qu'un OPCO ou l'employeur finance : cacher
    // le champ rendrait la demande impossible à enregistrer, sans rien dire.
    expect(FORM).toContain("form.funderKind === 'opco'");
    expect(FORM).toContain("form.funderKind === 'entreprise'");
  });

  it('un particulier n’emporte pas de SIRET orphelin', () => {
    // Choisir « entreprise » puis « particulier » laissait le SIRET saisi : il
    // serait parti sur la convention d'un particulier.
    expect(FORM).toMatch(/t === 'particulier'[\s\S]{0,200}companySiret: ''/);
  });

  it('« Autre » demande la situation précise, que le BPF distingue', () => {
    expect(FORM).toContain("{type === 'autre' && (");
    expect(FORM).toContain("x.value === 'demandeur' || x.value === 'independant'");
  });

  it('le financement n’est qu’une proposition', () => {
    // Une entreprise peut payer elle-même, un particulier mobiliser son CPF.
    expect(FORM).toContain('funderKind: def.financement || f.funderKind');
  });
});

describe('le référent', () => {
  it('est le demandeur par défaut, et l’écran le dit', () => {
    expect(FORM).toContain('Qui fait la demande, chez le client');
    expect(FORM).toContain('c’est lui le référent du dossier');
  });

  it('n’est redemandé que lorsque le demandeur devient stagiaire', () => {
    // C'est exactement le cas que la conversion va chercher dans ces champs.
    // Les afficher en permanence faisait saisir deux fois la même personne.
    expect(FORM).toContain('{entreprise && form.candidateIsLearner && (');
    expect(FORM).toContain('Référent du dossier');
  });
});
