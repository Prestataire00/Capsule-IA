import type { Result } from '@/shared/lib/result';
import { ok, err } from '@/shared/lib/result';

export type Currency = 'EUR' | 'USD' | 'CHF' | 'GBP';

export class Money {
  private constructor(
    readonly cents: number,
    readonly currency: Currency,
  ) {}

  static create(cents: number, currency: Currency = 'EUR'): Result<Money, 'invalid_amount'> {
    if (!Number.isInteger(cents) || cents < 0) return err('invalid_amount');
    return ok(new Money(cents, currency));
  }

  static zero(currency: Currency = 'EUR'): Money {
    return new Money(0, currency);
  }

  add(other: Money): Result<Money, 'currency_mismatch'> {
    if (other.currency !== this.currency) return err('currency_mismatch');
    return ok(new Money(this.cents + other.cents, this.currency));
  }

  subtract(other: Money): Result<Money, 'currency_mismatch' | 'negative_amount'> {
    if (other.currency !== this.currency) return err('currency_mismatch');
    const next = this.cents - other.cents;
    if (next < 0) return err('negative_amount');
    return ok(new Money(next, this.currency));
  }

  equals(other: Money): boolean {
    return this.cents === other.cents && this.currency === other.currency;
  }
}
