import type { Result } from '@/shared/lib/result';
import { ok, err } from '@/shared/lib/result';

const RE = /^DOS-\d{4}-\d{4,}$/;

export class DossierReference {
  private constructor(readonly value: string) {}

  static create(value: string): Result<DossierReference, 'invalid_reference'> {
    if (!RE.test(value)) return err('invalid_reference');
    return ok(new DossierReference(value));
  }

  static hydrate(value: string): DossierReference {
    return new DossierReference(value);
  }
}
