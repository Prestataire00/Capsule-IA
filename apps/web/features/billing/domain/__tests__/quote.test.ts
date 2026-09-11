import { describe, expect, it } from 'vitest';
import {
  addDays,
  canEditQuote,
  canSendQuote,
  computeQuoteTotals,
  defaultUnitPriceCents,
  isQuoteActive,
  isQuoteExpired,
  parseEurosToCents,
  quoteObject,
  resolveQuoteClient,
} from '../quote';

describe('computeQuoteTotals', () => {
  it('additionne les lignes au taux du devis', () => {
    const t = computeQuoteTotals(
      [{ description: 'Formation', quantity: 3, unitAmountCents: 50_000, vatRate: null }],
      20,
    );
    expect(t).toMatchObject({ subtotalCents: 150_000, vatCents: 30_000, totalCents: 180_000 });
  });

  it('ventile par taux quand une ligne a son propre taux', () => {
    const t = computeQuoteTotals(
      [
        { description: 'Formation', quantity: 1, unitAmountCents: 100_000, vatRate: null },
        { description: 'Repas', quantity: 2, unitAmountCents: 1_500, vatRate: 10 },
      ],
      0,
    );
    expect(t.byRate).toEqual([
      { rate: 0, baseCents: 100_000, vatCents: 0 },
      { rate: 10, baseCents: 3_000, vatCents: 300 },
    ]);
    expect(t.totalCents).toBe(103_300);
  });

  it('organisme exonéré : total net = total HT', () => {
    const t = computeQuoteTotals([{ description: 'x', quantity: 1, unitAmountCents: 99_900, vatRate: null }], 0);
    expect(t.totalCents).toBe(t.subtotalCents);
  });
});

describe('defaultUnitPriceCents', () => {
  it('prend le tarif de la session en priorité', () => {
    expect(defaultUnitPriceCents(80_000, 120_000)).toBe(80_000);
  });
  it('retombe sur le tarif catalogue', () => {
    expect(defaultUnitPriceCents(null, 120_000)).toBe(120_000);
  });
  it('accepte une session gratuite', () => {
    expect(defaultUnitPriceCents(0, 120_000)).toBe(0);
  });
});

describe('resolveQuoteClient', () => {
  it('entreprise si le dossier y est rattaché', () => {
    expect(resolveQuoteClient({ companyId: 'c1', learnerId: 'l1' })).toEqual({ kind: 'company', companyId: 'c1' });
  });
  it('particulier sinon', () => {
    expect(resolveQuoteClient({ companyId: null, learnerId: 'l1' })).toEqual({ kind: 'individual', learnerId: 'l1' });
  });
});

describe('statuts', () => {
  it('édition réservée au brouillon', () => {
    expect(canEditQuote('draft')).toBe(true);
    expect(canEditQuote('sent')).toBe(false);
  });
  it('renvoi possible tant que non signé', () => {
    expect(canSendQuote('sent')).toBe(true);
    expect(canSendQuote('signed')).toBe(false);
  });
  it('un devis refusé ne bloque plus', () => {
    expect(isQuoteActive('refused')).toBe(false);
    expect(isQuoteActive('signed')).toBe(true);
  });
  it('expire après la date de validité, seulement une fois envoyé', () => {
    expect(isQuoteExpired('sent', '2026-09-01', '2026-09-11')).toBe(true);
    expect(isQuoteExpired('draft', '2026-09-01', '2026-09-11')).toBe(false);
  });
});

describe('utilitaires', () => {
  it('addDays', () => {
    expect(addDays('2026-09-11', 30)).toBe('2026-10-11');
  });
  it('parseEurosToCents', () => {
    expect(parseEurosToCents('1 500,50')).toBe(150_050);
    expect(parseEurosToCents('1500 €')).toBe(150_000);
    expect(parseEurosToCents('abc')).toBeNull();
  });
  it('quoteObject', () => {
    expect(quoteObject('SST', 1)).toBe('Formation SST — 1 stagiaire');
    expect(quoteObject('SST', 4)).toBe('Formation SST — 4 stagiaires');
  });
});
