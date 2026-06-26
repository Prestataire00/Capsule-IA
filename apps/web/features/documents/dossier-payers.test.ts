import { describe, it, expect } from 'vitest';
import { derivePayers, type DossierFunderRow } from './dossier-payers';

const row = (over: Partial<DossierFunderRow> & { kind: string; amount: number }): DossierFunderRow => ({
  funder_id: over.funder_id ?? `f-${over.kind}`,
  amount_cents: over.amount,
  external_file_number: over.external_file_number ?? null,
  funder: { name: over.funder?.name ?? over.kind.toUpperCase(), kind: over.kind },
});

describe('derivePayers', () => {
  it('CPF + Autofinancement couvrant le total → 2 payeurs, pas de reste à charge', () => {
    const payers = derivePayers(100_000, [
      row({ funder_id: 'f-cpf', kind: 'cpf', amount: 60_000, external_file_number: 'CPF-123' }),
      row({ funder_id: 'f-auto', kind: 'autofinancement', amount: 40_000 }),
    ]);
    expect(payers.map((p) => p.payer)).toEqual(['f-cpf', 'f-auto']);
    expect(payers[0]).toMatchObject({ modeLabel: 'CPF', amountCents: 60_000, externalFileNumber: 'CPF-123' });
    expect(payers[1]).toMatchObject({ modeLabel: 'Autofinancement', amountCents: 40_000 });
  });

  it('financeur partiel → financeur + reste à charge', () => {
    const payers = derivePayers(100_000, [row({ funder_id: 'f-cpf', kind: 'cpf', amount: 70_000 })]);
    expect(payers.map((p) => p.payer)).toEqual(['f-cpf', 'reste']);
    expect(payers[1]).toMatchObject({
      payer: 'reste',
      amountCents: 30_000,
      modeLabel: 'Reste à charge (financement direct)',
    });
  });

  it('aucun financeur → un seul reste à charge (= total)', () => {
    const payers = derivePayers(50_000, []);
    expect(payers).toHaveLength(1);
    expect(payers[0]).toMatchObject({ payer: 'reste', amountCents: 50_000 });
  });

  it('total nul et aucun financeur → liste vide (convention générique)', () => {
    expect(derivePayers(0, [])).toEqual([]);
  });

  it('ignore les financeurs à montant nul', () => {
    const payers = derivePayers(100_000, [
      row({ funder_id: 'f-cpf', kind: 'cpf', amount: 100_000 }),
      row({ funder_id: 'f-opco', kind: 'opco', amount: 0 }),
    ]);
    expect(payers.map((p) => p.payer)).toEqual(['f-cpf']);
  });
});
