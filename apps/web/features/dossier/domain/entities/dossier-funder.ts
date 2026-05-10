import type { Result } from '@/shared/lib/result';
import { ok } from '@/shared/lib/result';
import {
  FunderAllocation,
  type FunderAllocationProps,
} from '../value-objects/funder-allocation';
import type { DossierFunderId } from '../ids';

export type DossierFunderProps = {
  readonly id: DossierFunderId;
  readonly allocation: FunderAllocation;
};

export class DossierFunder {
  private constructor(private readonly props: DossierFunderProps) {}

  static create(
    id: DossierFunderId,
    allocationProps: FunderAllocationProps,
  ): Result<DossierFunder, 'invalid_allocation'> {
    const r = FunderAllocation.create(allocationProps);
    if (!r.ok) return r;
    return ok(new DossierFunder({ id, allocation: r.value }));
  }

  static hydrate(props: DossierFunderProps): DossierFunder {
    return new DossierFunder(props);
  }

  get id(): DossierFunderId {
    return this.props.id;
  }
  get allocation(): FunderAllocation {
    return this.props.allocation;
  }
}
