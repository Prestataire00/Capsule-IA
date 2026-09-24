// Réunion du 21/09/2026 : « l'adresse e-mail obligatoire pour la création d'un
// profil d'apprenant a-t-elle été supprimée ? » — réponse donnée à Laurie :
// oui. Elle l'était en base (migration 0176), pas dans les écrans.
//
// Conséquence concrète : un stagiaire arrivé sans adresse — liste nominative
// transmise plus tard, import d'une convention — ne pouvait plus être
// réenregistré depuis sa fiche. Le formulaire refusait « Email invalide » sur
// un champ qu'on n'avait pas à remplir.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { UpdateLearnerSchema } from '../app/(dashboard)/apprenants/[id]/schema';

const lire = (rel: string) => fs.readFileSync(path.resolve(__dirname, '..', rel), 'utf-8');
const CREATION_ACTION = lire('app/(dashboard)/apprenants/nouveau/actions.ts');
const CREATION_PAGE = lire('app/(dashboard)/apprenants/nouveau/page.tsx');
const DIALOGUE = lire('app/(dashboard)/apprenants/[id]/edit-learner-dialog.tsx');
const MODIF_ACTION = lire('app/(dashboard)/apprenants/[id]/actions.ts');

const base = {
  learnerId: '01a0a1c8-dbb2-7465-934c-39a3d9c32208',
  firstName: 'Alice',
  lastName: 'Martin',
  rqth: false,
};

describe('la modification d’une fiche apprenant', () => {
  it('accepte une fiche sans adresse', () => {
    expect(UpdateLearnerSchema.safeParse({ ...base, email: '' }).success).toBe(true);
    expect(UpdateLearnerSchema.safeParse(base).success).toBe(true);
  });

  it('refuse toujours une adresse mal écrite', () => {
    // Facultative ne veut pas dire quelconque : une adresse fausse fait échouer
    // les envois sans que personne le sache.
    const r = UpdateLearnerSchema.safeParse({ ...base, email: 'alice@' });
    expect(r.success).toBe(false);
  });
});

describe('la création d’une fiche apprenant', () => {
  it('n’exige plus que le prénom et le nom', () => {
    expect(CREATION_ACTION).toContain('if (!firstName || !lastName) redirect');
    expect(CREATION_ACTION).not.toContain('|| !email) redirect');
  });

  it('et l’écran ne marque plus le champ obligatoire', () => {
    expect(CREATION_PAGE).not.toContain('<FormField label="Email" required>');
    expect(DIALOGUE).not.toContain('<FormField label="Email" required>');
  });

  it('annonce ce que l’absence d’adresse coûte', () => {
    // Facultatif n'est pas sans conséquence : plus aucun envoi automatique ne
    // concerne ce stagiaire. Mieux vaut le dire au moment de la saisie.
    expect(CREATION_PAGE).toContain('aucun envoi automatique ne le concernera');
  });
});

describe('l’absence d’adresse s’écrit NULL', () => {
  it('à la création comme à la modification', () => {
    // L'index unique de la 0176 compte deux chaînes vides comme un doublon :
    // le deuxième stagiaire sans adresse aurait été refusé.
    expect(CREATION_ACTION).toContain('email: email || null');
    expect(MODIF_ACTION).toContain("email: (parsedInput.email?.trim() || null)");
  });
});
