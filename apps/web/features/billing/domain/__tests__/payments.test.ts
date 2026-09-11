import { describe, expect, it } from 'vitest';
import { remainingCents, settlementStatus } from '../payments';

describe('settlementStatus', () => {
  it('rien encaissé → émise', () => {
    expect(settlementStatus(100_000, 0)).toBe('issued');
  });
  it('acompte → partielle', () => {
    expect(settlementStatus(100_000, 30_000)).toBe('partially_paid');
  });
  it('solde encaissé → payée, à un centime près', () => {
    expect(settlementStatus(100_000, 99_999)).toBe('paid');
    expect(settlementStatus(100_000, 100_000)).toBe('paid');
  });
  it('trop-perçu → payée', () => {
    expect(settlementStatus(100_000, 120_000)).toBe('paid');
  });
});

describe('remainingCents', () => {
  it('jamais négatif', () => {
    expect(remainingCents(100_000, 30_000)).toBe(70_000);
    expect(remainingCents(100_000, 150_000)).toBe(0);
  });
});
