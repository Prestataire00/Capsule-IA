import type { Result } from '@/shared/lib/result';
import { ok } from '@/shared/lib/result';
import { Money } from './money';
import { SharePercent } from './share-percent';
import type { FunderId } from '../ids';

export type FunderAllocationStatus = 'pending' | 'approved' | 'refused' | 'paid';

export type FunderAllocationProps = {
  readonly funderId: FunderId;
  readonly amount: Money;
  readonly share: SharePercent | null;
  readonly status: FunderAllocationStatus;
  readonly externalFileNumber: string | null;
};

export class FunderAllocation {
  private constructor(private readonly props: FunderAllocationProps) {}

  static create(
    props: FunderAllocationProps,
  ): Result<FunderAllocation, 'invalid_allocation'> {
    return ok(new FunderAllocation(props));
  }

  get funderId(): FunderId {
    return this.props.funderId;
  }
  get amount(): Money {
    return this.props.amount;
  }
  get share(): SharePercent | null {
    return this.props.share;
  }
  get status(): FunderAllocationStatus {
    return this.props.status;
  }
  get externalFileNumber(): string | null {
    return this.props.externalFileNumber;
  }

  withStatus(status: FunderAllocationStatus): FunderAllocation {
    return new FunderAllocation({ ...this.props, status });
  }
}
