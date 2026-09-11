// Espace formateur (phase 3) : tarif sur la fiche, factures d'honoraires, notes de frais.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  adresseLignes,
  eurosEnCentimes,
  joursFactures,
  ligneSeance,
  totaux,
} from '@/features/trainer-space/billing-rules';
import { generateTrainerInvoicePdf } from '@/features/trainer-space/trainer-invoice-pdf';

const lire = (rel: string) => fs.readFileSync(path.resolve(__dirname, rel), 'utf-8');
const SQL = lire('../../../supabase/migrations/0153_espace_formateur_facturation.sql');

// Séance de 9 h à 12 h 30 (Paris, heure d'été) le 14 septembre 2026.
const MATIN = { id: 's1', title: 'Excel', startsAt: '2026-09-14T07:00:00Z', endsAt: '2026-09-14T10:30:00Z' };
const JOURNEE = { id: 's2', title: 'Excel', startsAt: '2026-09-15T07:00:00Z', endsAt: '2026-09-15T15:00:00Z' };

describe('calcul automatique depuis le tarif de la fiche', () => {
  it('à l’heure : durée × tarif', () => {
    const l = ligneSeance(MATIN, 'heure', 5000)!;
    expect(l.quantity).toBe(3.5);
    expect(l.totalCents).toBe(17500);
  });

  it('à la journée : ½ jour jusqu’à 4 h, 1 jour au-delà, une journée par date', () => {
    expect(joursFactures(MATIN.startsAt, MATIN.endsAt)).toBe(0.5);
    expect(joursFactures(JOURNEE.startsAt, JOURNEE.endsAt)).toBe(1);
    expect(joursFactures('2026-09-14T07:00:00Z', '2026-09-16T15:00:00Z')).toBe(3);
    expect(ligneSeance(MATIN, 'jour', 40000)!.totalCents).toBe(20000);
  });

  it('à la séance : un forfait par séance', () => {
    expect(ligneSeance(JOURNEE, 'session', 30000)!.totalCents).toBe(30000);
  });

  it('un tarif posé sur la séance l’emporte ; sans tarif, pas de ligne', () => {
    expect(ligneSeance({ ...MATIN, forfaitCents: 12345 }, 'heure', 5000)!.totalCents).toBe(12345);
    expect(ligneSeance({ ...MATIN, tauxHoraireCents: 6000 }, 'jour', 40000)!.totalCents).toBe(21000);
    expect(ligneSeance(MATIN, null, null)).toBeNull();
  });

  it('TVA : franchise sans TVA, assujetti au taux du profil', () => {
    expect(totaux([{ totalCents: 17500 }], 'franchise', 20)).toEqual({ subtotalCents: 17500, vatCents: 0, totalCents: 17500 });
    expect(totaux([{ totalCents: 17500 }], 'assujetti', 20)).toEqual({ subtotalCents: 17500, vatCents: 3500, totalCents: 21000 });
  });

  it('saisie des montants et adresse de l’organisme', () => {
    expect(eurosEnCentimes('1 234,50')).toBe(123450);
    expect(eurosEnCentimes('12,345')).toBeNull();
    expect(adresseLignes({ line1: '3 rue Neuve', postal_code: '75001', city: 'Paris' })).toEqual(['3 rue Neuve', '75001 Paris']);
  });
});

describe('PDF de la facture', () => {
  it('se génère avec accents, euro et espaces insécables du format français', async () => {
    const pdf = await generateTrainerInvoicePdf({
      number: 'AF-2026-0007',
      issueDate: '2026-09-16',
      dueDate: '2026-10-16',
      issuer: { legalName: 'Anissa Fiévé EI', addressLines: ['3 rue de l’Église', '69001 Lyon'], siret: '12345678901234', vatNumber: null, email: 'a@exemple.fr', iban: 'FR7630006000011234567890189', bic: null },
      client: { name: 'Capsule Formation', addressLines: ['1 place Bellecour', '69002 Lyon'], siret: '98765432109876' },
      lines: [{ label: 'Excel — séance du 14/09/2026', quantity: 3.5, unit: 'heure', unitPriceCents: 5000, totalCents: 17500 }],
      vatRegime: 'franchise',
      vatRate: 0,
      subtotalCents: 17500,
      vatCents: 0,
      totalCents: 17500,
      notes: 'Merci pour votre confiance — à bientôt.',
    });
    expect(Buffer.from(pdf.slice(0, 4)).toString()).toBe('%PDF');
  });
});

describe('garde-fous', () => {
  it('le formateur ne peut pas modifier son tarif', () => {
    expect(SQL).toContain('NEW.tarif_cents       IS DISTINCT FROM OLD.tarif_cents');
  });

  it('lecture : le formateur pour les siennes, les rôles facturation de l’organisme ; aucune écriture directe', () => {
    expect(SQL).toContain("app.current_role() IN ('owner', 'admin', 'gestionnaire', 'comptable')");
    expect(SQL).not.toMatch(/FOR (INSERT|UPDATE|DELETE|ALL)/);
    expect(SQL).toContain('REVOKE ALL ON FUNCTION app.next_trainer_invoice_number(UUID) FROM PUBLIC, anon, authenticated');
  });

  it('une facture générée est recalculée côté serveur : le navigateur n’envoie aucun montant', () => {
    const actions = lire('../app/(formateur)/mes-factures/actions.ts');
    expect(actions).toContain('createGeneratedInvoice(input: { organizationId: string; notes?: string | null })');
    expect(actions).toContain('await seancesFacturables(user.id, input.organizationId)');
  });

  it('les décisions exigent le droit de gérer la facturation et l’état attendu', () => {
    const actions = lire('../app/(dashboard)/formateurs/facturation/actions.ts');
    expect(actions).toContain("can(membre.role, 'billing') !== 'manage'");
    expect(actions).toContain(".eq('status', 'soumise')");
    expect(actions).toContain(".eq('organization_id', g.organizationId)");
  });

  it('justificatifs et factures déposées vérifiés sur leurs octets', () => {
    expect(lire('../app/api/formateur/frais/route.ts')).toContain('sniffJustification(octets)');
    expect(lire('../app/api/formateur/factures/route.ts')).toContain("sniffJustification(octets)?.mime !== 'application/pdf'");
  });
});
