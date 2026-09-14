// Référent d'un dossier (0167) : destinataire des documents, et personne
// affichée tant que la liste nominative des stagiaires n'est pas arrivée.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { estTitulaireProvisoire, nomDuDossier, DOMAINE_PROVISOIRE } from '@/features/dossier/referent';

const lire = (rel: string) => fs.readFileSync(path.resolve(__dirname, rel), 'utf-8');

describe('titulaire provisoire', () => {
  it('se reconnaît à son domaine réservé', () => {
    expect(DOMAINE_PROVISOIRE).toBe('@import.invalid');
    expect(estTitulaireProvisoire('liste-a-venir.01a0a1a8@import.invalid')).toBe(true);
    expect(estTitulaireProvisoire('nathaniel.dahan@france-metiers.fr')).toBe(false);
    expect(estTitulaireProvisoire(null)).toBe(false);
  });
});

describe('nom affiché d’un dossier', () => {
  const referent = { firstName: 'Nathaniel', lastName: 'DAHAN', position: 'Représentant légal' };

  it('montre le référent quand le titulaire est provisoire', () => {
    const r = nomDuDossier({
      learner: { firstName: 'Stagiaires', lastName: 'à désigner', email: 'x@import.invalid' },
      referent,
    });
    expect(r).toEqual({ nom: 'Nathaniel DAHAN', estReferent: true });
  });

  it('montre l’apprenant dès qu’il est réel, même s’il y a un référent', () => {
    const r = nomDuDossier({
      learner: { firstName: 'Claire', lastName: 'Martin', email: 'claire@exemple.fr' },
      referent,
    });
    expect(r).toEqual({ nom: 'Claire Martin', estReferent: false });
  });

  it('retombe sur le nom du client si l’on n’a ni apprenant réel ni référent', () => {
    const r = nomDuDossier({
      learner: { firstName: 'Stagiaires', lastName: 'à désigner', email: 'x@import.invalid' },
      referent: null,
      companyName: 'FRANCE METIERS',
    });
    expect(r).toEqual({ nom: 'FRANCE METIERS', estReferent: false });
  });

  it('n’affiche jamais « à désigner » quand un référent existe', () => {
    const r = nomDuDossier({
      learner: { firstName: 'Stagiaires', lastName: 'à désigner', email: 'x@import.invalid' },
      referent,
      companyName: 'FRANCE METIERS',
    });
    expect(r.nom).not.toMatch(/désigner/i);
  });
});

describe('migration 0167', () => {
  const sql = lire('../../../supabase/migrations/0167_dossier_referent.sql');

  it('le référent pointe un contact et survit à sa suppression', () => {
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS contact_id UUID REFERENCES app.contacts(id) ON DELETE SET NULL');
  });
});

describe('import et affichage', () => {
  it('l’import pose le référent sur le dossier', () => {
    expect(lire('../features/import/apply-convention.ts')).toContain('contact_id: contactId');
  });

  it('les listes lisent le référent à part, pour ne pas tomber sans la migration', () => {
    const page = lire('../app/(dashboard)/dossiers/page.tsx');
    expect(page).toContain("select('id, contact:contacts(first_name, last_name, position)')");
    expect(page).toContain('nomDuDossier');
  });

  it('la fiche annonce à quoi sert ce référent', () => {
    const layout = lire('../app/(dashboard)/dossiers/[id]/layout.tsx');
    expect(layout).toContain('Destinataire de la convention, des devis et des factures.');
  });
});
