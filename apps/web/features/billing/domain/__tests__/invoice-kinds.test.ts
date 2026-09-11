import { describe, expect, it } from 'vitest';
import {
  balanceAmounts,
  checkDeposit,
  creditableCents,
  depositAmounts,
  reminderDue,
  signedCents,
} from '../invoice-kinds';

const quote = { subtotalCents: 100_000, vatCents: 20_000, totalCents: 120_000 };

describe('acompte et solde', () => {
  it('acompte de 30 %', () => {
    expect(depositAmounts(quote, 30)).toEqual({ subtotalCents: 30_000, vatCents: 6_000, totalCents: 36_000 });
  });
  it('solde = devis − acomptes', () => {
    expect(balanceAmounts(quote, [depositAmounts(quote, 30)])).toEqual({
      subtotalCents: 70_000,
      vatCents: 14_000,
      totalCents: 84_000,
    });
  });
  it('acompte + solde = devis', () => {
    const d = depositAmounts({ subtotalCents: 99_999, vatCents: 0, totalCents: 99_999 }, 33);
    const b = balanceAmounts({ subtotalCents: 99_999, vatCents: 0, totalCents: 99_999 }, [d]);
    expect(d.totalCents + b.totalCents).toBe(99_999);
  });
});

describe('checkDeposit', () => {
  it('particulier plafonné à 30 %', () => {
    expect(checkDeposit(30, 'individual', 0)).toBeNull();
    expect(checkDeposit(40, 'individual', 0)).toBe('individual_cap');
    expect(checkDeposit(20, 'individual', 20)).toBe('individual_cap');
  });
  it('entreprise libre, sans atteindre 100 %', () => {
    expect(checkDeposit(50, 'company', 0)).toBeNull();
    expect(checkDeposit(50, 'company', 50)).toBe('exceeds_quote');
  });
  it('pourcentage borné', () => {
    expect(checkDeposit(0, 'company', 0)).toBe('percent_out_of_range');
  });
});

describe('avoirs', () => {
  it('un avoir se déduit', () => {
    expect(signedCents('credit_note', 5_000)).toBe(-5_000);
    expect(signedCents('invoice', 5_000)).toBe(5_000);
  });
  it('créditable = total − avoirs déjà émis', () => {
    expect(creditableCents(120_000, 20_000)).toBe(100_000);
    expect(creditableCents(120_000, 150_000)).toBe(0);
  });
});

describe('reminderDue', () => {
  it('pas avant l’échéance', () => {
    expect(reminderDue({ dueAt: '2026-09-20', today: '2026-09-11', reminderCount: 0, lastReminderAt: null })).toBe(false);
  });
  it('première relance le lendemain de l’échéance', () => {
    expect(reminderDue({ dueAt: '2026-09-10', today: '2026-09-11', reminderCount: 0, lastReminderAt: null })).toBe(true);
  });
  it('15 jours entre deux relances, 3 au plus', () => {
    expect(
      reminderDue({ dueAt: '2026-08-01', today: '2026-09-11', reminderCount: 1, lastReminderAt: '2026-09-01T09:00:00Z' }),
    ).toBe(false);
    expect(
      reminderDue({ dueAt: '2026-08-01', today: '2026-09-11', reminderCount: 1, lastReminderAt: '2026-08-20T09:00:00Z' }),
    ).toBe(true);
    expect(reminderDue({ dueAt: '2026-06-01', today: '2026-09-11', reminderCount: 3, lastReminderAt: null })).toBe(false);
  });
});
