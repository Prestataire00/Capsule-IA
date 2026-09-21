// Suivi de la prise en charge : où en est le financement d'un dossier, qui
// peut en changer le statut, et combien reste-t-il à payer.
//
// Le schéma existait (0177 : statuts, montant accordé, note de décision) mais
// aucun écran ne permettait d'y toucher : toute ligne restait « à déposer » à
// vie. Demande d'Ismael du 21/09/2026.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const lire = (rel: string) => fs.readFileSync(path.resolve(__dirname, rel), 'utf-8');
const ACTIONS = lire('../app/(dashboard)/dossiers/[id]/financeurs/actions.ts');
const PAGE = lire('../app/(dashboard)/dossiers/[id]/financeurs/page.tsx');
const CLIENT = lire('../app/(dashboard)/dossiers/[id]/financeurs/prise-en-charge.client.tsx');

describe('qui peut décider', () => {
  it('c’est une affaire de facturation, pas de gestion de dossier', () => {
    // Le comptable doit pouvoir saisir la décision — le reste à payer en
    // dépend ; le formateur jamais.
    expect(ACTIONS).toContain("guardRowAction('dossiers', input.dossierId, 'billing')");
  });

  it('la ligne doit appartenir au dossier visé', () => {
    // Sans cela, un identifiant deviné suffirait à modifier la prise en charge
    // d'un autre organisme.
    expect(ACTIONS).toContain(".eq('dossier_id', input.dossierId)");
  });

  it('l’écran ne propose la modification qu’à qui en a le droit', () => {
    expect(PAGE).toContain("canManageSection('billing')");
    expect(CLIENT).toContain('{gerer && !ouvert');
  });
});

describe('ce qui est enregistré', () => {
  it('refuse un statut inventé', () => {
    expect(ACTIONS).toContain('estStatutFinancement(input.statut)');
  });

  it('refuse un montant négatif ou illisible', () => {
    expect(ACTIONS).toContain('input.montantAccordeCents < 0');
    expect(ACTIONS).toContain('Number.isFinite(input.montantAccordeCents)');
  });

  it('efface le montant accordé si la décision revient en arrière', () => {
    // Le garder laisserait croire à un accord qui n'existe plus.
    expect(ACTIONS).toContain('granted_cents: estDecide(input.statut) ? input.montantAccordeCents : null');
  });

  it('ne réécrit pas la date de dépôt une fois posée', () => {
    // Elle dit depuis quand on attend : c'est ce qu'un audit regarde.
    expect(ACTIONS).toContain("if (input.statut !== 'pending' && !actuelle.submitted_at) patch.submitted_at = maintenant;");
  });

  it('rafraîchit la fiche du dossier, pas seulement l’onglet', () => {
    expect(ACTIONS).toContain('revalidatePath(`/dossiers/${input.dossierId}/financeurs`)');
    expect(ACTIONS).toContain('revalidatePath(`/dossiers/${input.dossierId}`)');
  });
});

describe('ce que l’écran montre', () => {
  it('les quatre chiffres qui répondent à « où en est le financement »', () => {
    for (const libelle of ['Coût total', 'Pris en charge', 'En attente', 'Reste à payer']) {
      expect(PAGE, libelle).toContain(libelle);
    }
  });

  it('dit l’état en une phrase, sans faire lire les chiffres', () => {
    expect(PAGE).toContain('resumeFinancement(etat)');
  });

  it('annonce ce qu’il resterait si les demandes en attente aboutissaient', () => {
    expect(PAGE).toContain('etat.resteSiToutAccordeCents');
  });

  it('le cas sans financeur est dit, pas laissé vide', () => {
    expect(PAGE).toContain('le client règle la totalité');
  });

  it('signale un accord inférieur au demandé', () => {
    // C'est précisément là que le reste à payer se creuse.
    expect(CLIENT).toContain('accorde < ligne.amountCents');
  });

  it('les montants sont en tabular-nums, jamais en police à chasse fixe', () => {
    expect(PAGE).toContain('tabular-nums');
    expect(PAGE).not.toContain('font-mono');
    expect(CLIENT).not.toContain('font-mono');
  });
});
