import type { Result } from '@/shared/lib/result';
import { ok, err } from '@/shared/lib/result';
import { Hours } from '../value-objects/hours';
import { DateRange } from '../value-objects/date-range';
import type { DossierModuleId, ModuleId, OrganizationId } from '../ids';

export type DossierModuleProps = {
  readonly id: DossierModuleId;
  readonly organizationId: OrganizationId;
  readonly moduleId: ModuleId;
  readonly position: number;
  readonly titleSnapshot: string;
  readonly duration: Hours;
  readonly schedule: DateRange | null;
};

export class DossierModule {
  private constructor(private readonly props: DossierModuleProps) {}

  static create(props: DossierModuleProps): Result<DossierModule, 'invalid_module'> {
    if (!Number.isInteger(props.position) || props.position < 0) return err('invalid_module');
    if (!props.titleSnapshot.trim()) return err('invalid_module');
    return ok(new DossierModule(props));
  }

  static hydrate(props: DossierModuleProps): DossierModule {
    return new DossierModule(props);
  }

  get id(): DossierModuleId {
    return this.props.id;
  }
  get moduleId(): ModuleId {
    return this.props.moduleId;
  }
  get position(): number {
    return this.props.position;
  }
  get duration(): Hours {
    return this.props.duration;
  }
  get schedule(): DateRange | null {
    return this.props.schedule;
  }
  get titleSnapshot(): string {
    return this.props.titleSnapshot;
  }
}
