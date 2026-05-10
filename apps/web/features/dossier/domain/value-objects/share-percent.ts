import type { Result } from '@/shared/lib/result';
import { ok, err } from '@/shared/lib/result';

export class SharePercent {
  private constructor(readonly value: number) {}

  static create(value: number): Result<SharePercent, 'invalid_share'> {
    if (!Number.isFinite(value) || value < 0 || value > 100) return err('invalid_share');
    return ok(new SharePercent(Math.round(value * 100) / 100));
  }

  static zero(): SharePercent {
    return new SharePercent(0);
  }
}
