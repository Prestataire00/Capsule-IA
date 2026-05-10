import type { Result } from '@/shared/lib/result';
import { ok } from '@/shared/lib/result';
import type { TrainerId } from '../ids';
import type { Money } from '../value-objects/money';

export type DossierTrainerProps = {
  readonly trainerId: TrainerId;
  readonly isLead: boolean;
  readonly hourlyRate: Money | null;
};

export class DossierTrainer {
  private constructor(private readonly props: DossierTrainerProps) {}

  static create(props: DossierTrainerProps): Result<DossierTrainer, never> {
    return ok(new DossierTrainer(props));
  }

  static hydrate(props: DossierTrainerProps): DossierTrainer {
    return new DossierTrainer(props);
  }

  get trainerId(): TrainerId {
    return this.props.trainerId;
  }
  get isLead(): boolean {
    return this.props.isLead;
  }
  get hourlyRate(): Money | null {
    return this.props.hourlyRate;
  }
}
