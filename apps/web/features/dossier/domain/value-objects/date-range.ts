import type { Result } from '@/shared/lib/result';
import { ok, err } from '@/shared/lib/result';

export class DateRange {
  private constructor(
    readonly start: Date,
    readonly end: Date,
  ) {}

  static create(start: Date, end: Date): Result<DateRange, 'invalid_date_range'> {
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      return err('invalid_date_range');
    }
    if (end.getTime() < start.getTime()) return err('invalid_date_range');
    return ok(new DateRange(new Date(start), new Date(end)));
  }

  static hydrate(start: Date, end: Date): DateRange {
    return new DateRange(new Date(start), new Date(end));
  }

  contains(d: Date): boolean {
    return d.getTime() >= this.start.getTime() && d.getTime() <= this.end.getTime();
  }

  durationDays(): number {
    return Math.ceil(
      (this.end.getTime() - this.start.getTime()) / (1000 * 60 * 60 * 24),
    );
  }
}
