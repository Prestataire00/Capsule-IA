import type {
  CompanyId,
  DossierFunderId,
  DossierId,
  FormationId,
  FunderId,
  LearnerId,
  ModuleId,
  OrganizationId,
  TrainerId,
  UserId,
} from './ids';
import type { DossierStatus } from './value-objects/dossier-status';
import type { TrainingModality } from './value-objects/training-modality';

interface BaseEvent {
  readonly eventId: string;
  readonly type: string;
  readonly occurredAt: Date;
  readonly organizationId: OrganizationId;
  readonly aggregateId: DossierId;
  readonly actorUserId: UserId | null;
  readonly version: number;
}

export interface DossierCreated extends BaseEvent {
  readonly type: 'dossier.created';
  readonly payload: {
    readonly reference: string;
    readonly learnerId: LearnerId;
    readonly companyId: CompanyId | null;
    readonly formationId: FormationId;
    readonly modality: TrainingModality;
    readonly startDate: string;
    readonly endDate: string;
    readonly totalHours: number;
  };
}

export interface DossierModuleAdded extends BaseEvent {
  readonly type: 'dossier.module-added';
  readonly payload: { readonly moduleId: ModuleId; readonly position: number };
}

export interface DossierModuleRemoved extends BaseEvent {
  readonly type: 'dossier.module-removed';
  readonly payload: { readonly moduleId: ModuleId };
}

export interface DossierTrainerAssigned extends BaseEvent {
  readonly type: 'dossier.trainer-assigned';
  readonly payload: { readonly trainerId: TrainerId; readonly isLead: boolean };
}

export interface DossierTrainerUnassigned extends BaseEvent {
  readonly type: 'dossier.trainer-unassigned';
  readonly payload: { readonly trainerId: TrainerId };
}

export interface DossierFunderAdded extends BaseEvent {
  readonly type: 'dossier.funder-added';
  readonly payload: {
    readonly dossierFunderId: DossierFunderId;
    readonly funderId: FunderId;
    readonly amountCents: number;
    readonly sharePercent: number | null;
  };
}

export interface DossierFunderRemoved extends BaseEvent {
  readonly type: 'dossier.funder-removed';
  readonly payload: { readonly dossierFunderId: DossierFunderId };
}

export interface DossierStateEvent extends BaseEvent {
  readonly type:
    | 'dossier.submitted'
    | 'dossier.scheduled'
    | 'dossier.activated'
    | 'dossier.completed'
    | 'dossier.archived';
  readonly payload: Record<string, never>;
}

export interface DossierClosed extends BaseEvent {
  readonly type: 'dossier.closed';
  readonly payload: { readonly closedAt: string };
}
export interface DossierReopened extends BaseEvent {
  readonly type: 'dossier.reopened';
  readonly payload: { readonly reason: string };
}
export interface DossierCancelled extends BaseEvent {
  readonly type: 'dossier.cancelled';
  readonly payload: { readonly reason: string };
}

export type DossierDomainEvent =
  | DossierCreated
  | DossierModuleAdded
  | DossierModuleRemoved
  | DossierTrainerAssigned
  | DossierTrainerUnassigned
  | DossierFunderAdded
  | DossierFunderRemoved
  | DossierStateEvent
  | DossierClosed
  | DossierReopened
  | DossierCancelled;

export const eventBase = (args: {
  organizationId: OrganizationId;
  aggregateId: DossierId;
  actorUserId: UserId | null;
  eventId: string;
  occurredAt: Date;
}): Omit<BaseEvent, 'type'> => ({
  eventId: args.eventId,
  occurredAt: args.occurredAt,
  organizationId: args.organizationId,
  aggregateId: args.aggregateId,
  actorUserId: args.actorUserId,
  version: 1,
});

// Re-export status type so app/infra can import it from a single place
export { type DossierStatus };
