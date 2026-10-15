import { describe, expect, it } from 'vitest';
import { reaffecterBrouillons, type FactureDuDossier } from '../brouillons-financeurs';
import type { FunderAllocationInput } from '../billing-plan';

const opco = (montant: number, status: FunderAllocationInput['status'] = 'pending'): FunderAllocationInput => ({
  funderId: 'opco',
  name: 'OPCO',
  kind: 'opco',
  allocatedHtCents: montant,
  status,
});
const brouillon = (montant: number, funderId: string | null = null, status = 'draft'): FactureDuDossier => ({
  id: 'f1',
  funderId,
  subtotalHtCents: montant,
  status,
  kind: 'invoice',
});

describe('les brouillons suivent le plan de financement', () => {
  it('l’OPCO prend tout : le brouillon de l’entreprise passe à l’OPCO (cas Serra Paysage)', () => {
    expect(reaffecterBrouillons(500000, [opco(500000)], [brouillon(500000)])).toEqual([
      { type: 'transferer', invoiceId: 'f1', funderId: 'opco' },
    ]);
  });

  it('l’OPCO prend une partie : le brouillon est scindé, l’entreprise garde son reste', () => {
    expect(reaffecterBrouillons(500000, [opco(300000)], [brouillon(500000)])).toEqual([
      { type: 'scinder', invoiceId: 'f1', garderHtCents: 200000, funderId: 'opco', transfereHtCents: 300000 },
    ]);
  });

  it('une facture émise ne bouge jamais', () => {
    expect(reaffecterBrouillons(500000, [opco(500000)], [brouillon(500000, null, 'issued')])).toEqual([]);
  });

  it('rien à faire quand le plan tombe déjà juste', () => {
    expect(reaffecterBrouillons(500000, [opco(300000)], [brouillon(200000)])).toEqual([]);
  });

  it('financeur retiré ou refusé : son brouillon revient à l’entreprise', () => {
    expect(reaffecterBrouillons(500000, [], [brouillon(500000, 'opco')])).toEqual([
      { type: 'transferer', invoiceId: 'f1', funderId: null },
    ]);
    expect(reaffecterBrouillons(500000, [opco(500000, 'refused')], [brouillon(500000, 'opco')])).toEqual([
      { type: 'transferer', invoiceId: 'f1', funderId: null },
    ]);
  });
});
