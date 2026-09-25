// « Je dois pouvoir modifier le montant du dossier, que ce soit Faouzi, Ismael
// ou Laurie » — 25/09/2026.
//
// Le montant se posait à la création — repris de la demande ou du tarif
// catalogue — et ne bougeait plus. Une remise négociée, un stagiaire de plus ou
// de moins, un devis revu obligeaient à reprendre le dossier par la base. Or
// c'est lui qui commande le reste à payer, le devis et la facture.
//
// Relevé des membres le jour même : Faouzi est propriétaire, Ismael
// administrateur, Laurie gestionnaire — les trois gèrent la facturation. Un
// formateur, non : sa fiche annonce qu'il suit l'affaire « sans accès aux
// tarifs ni à la facturation », et cette promesse-là doit tenir.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { can, type Section } from '../shared/lib/auth/permissions';

const lire = (rel: string) => fs.readFileSync(path.resolve(__dirname, rel), 'utf-8');
const ACTION = lire('../app/(dashboard)/dossiers/[id]/montant-actions.ts');
const CHAMP = lire('../app/(dashboard)/dossiers/[id]/montant.client.tsx');
const LAYOUT = lire('../app/(dashboard)/dossiers/[id]/layout.tsx');

describe('qui peut modifier le montant', () => {
  const SECTION: Section = 'billing';

  it('les trois personnes de l’organisme', () => {
    for (const role of ['owner', 'admin', 'gestionnaire']) {
      expect(can(role, SECTION), role).toBe('manage');
    }
  });

  it('et pas le formateur, dont la fiche promet l’inverse', () => {
    expect(can('formateur', SECTION)).toBe('none');
  });

  it('la garde est celle de la facturation, pas celle du dossier', () => {
    // `dossiers` aurait suffi à trois d'entre eux, mais aurait aussi ouvert le
    // tarif au formateur, à qui l'écran promet le contraire.
    expect(ACTION).toContain("guardAction('billing')");
    expect(LAYOUT).toContain("canManageSection('billing')");
    expect(LAYOUT).toContain('gererFacturation ? (');
  });
});

describe('ce que la saisie accepte', () => {
  it('refuse ce qui n’est pas un montant', () => {
    expect(ACTION).toContain('Montant invalide — écrivez par exemple 4000 ou 4 000,50.');
  });

  it('distingue « à définir » de « gratuit »', () => {
    // Écrire zéro pour un montant inconnu aurait sorti un devis à 0 €.
    expect(ACTION).toContain('let cents: number | null = null;');
    expect(ACTION).toMatch(/Vide efface le montant plutôt que d'écrire zéro/);
    expect(CHAMP).toContain('Vide = à définir');
  });

  it('réutilise la conversion des euros, sans la réécrire', () => {
    // Deux analyses de « 4 000,50 » finiraient par diverger.
    expect(ACTION).toContain("import { parseEurosToCents } from '@/features/billing/domain/quote';");
  });
});

describe('après la modification', () => {
  it('les écrans qui en dépendent relisent', () => {
    // Le reste à payer se calcule à partir de ce montant : sans cela, deux
    // écrans annonceraient deux chiffres sur la même affaire.
    expect(ACTION).toContain("revalidatePath(`/dossiers/${p.data.dossierId}/financeurs`)");
    expect(ACTION).toContain("revalidatePath('/dossiers')");
  });
});
