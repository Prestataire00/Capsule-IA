import type { Result } from '@/shared/lib/result';
import { ok, err } from '@/shared/lib/result';

export class Hours {
  private constructor(readonly value: number) {}

  static create(value: number): Result<Hours, 'invalid_hours'> {
    if (!Number.isFinite(value) || value <= 0) return err('invalid_hours');
    const rounded = Math.round(value * 4) / 4;
    return ok(new Hours(rounded));
  }

  add(other: Hours): Hours {
    return new Hours(this.value + other.value);
  }
}
