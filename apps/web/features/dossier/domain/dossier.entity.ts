import type { Result } from '@/shared/lib/result';
import { ok, err } from '@/shared/lib/result';
import { DateRange } from './value-objects/date-range';
import { Hours } from './value-objects/hours';
import { DossierReference } from './value-objects/dossier-reference';
import {
  type DossierStatus,
  guardTransition,
  isMutable,
} from './value-objects/dossier-status';
import { type TrainingModality } from './value-objects/training-modality';
import { Money } from './value-objects/money';
import type { SharePercent } from './value-objects/share-percent';
import { DossierModule } from './entities/dossier-module';
import { DossierTrainer } from './entities/dossier-trainer';
import { DossierFunder } from './entities/dossier-funder';
import { eventBase, type DossierDomainEvent } from './dossier.events';
import type { DossierError, ClosingBlocker } from './dossier.errors';
import type {
  CompanyId,
  DossierFunderId,
  DossierId,
  FormationId,
  LearnerId,
  ModuleId,
  OrganizationId,
  TrainerId,
  UserId,
} from './ids';

export type ClosingChecklist = {
  readonly qualiopiBlockingMissing: number;
  readonly documentsAllSigned: boolean;
  readonly attendanceAllSigned: boolean;
  readonly questionnairesAllCompleted: boolean;
};

type DossierProps = {
  id: DossierId;
  organizationId: OrganizationId;
  reference: DossierReference;
  learnerId: LearnerId;
  companyId: CompanyId | null;
  formationId: FormationId;
  status: DossierStatus;
  modality: TrainingModality;
  period: DateRange;
  totalHours: Hours;
  totalAmount: Money | null;
  modules: DossierModule[];
  trainers: DossierTrainer[];
  funders: DossierFunder[];
  closedAt: Date | null;
  cancelledAt: Date | null;
  cancellationReason: string | null;
};

export type CreateDossierInput = {
  id: DossierId;
  organizationId: OrganizationId;
  reference: DossierReference;
  learnerId: LearnerId;
  companyId: CompanyId | null;
  formationId: FormationId;
  modality: TrainingModality;
  period: DateRange;
  totalHours: Hours;
  totalAmount: Money | null;
  actorUserId: UserId | null;
  newEventId: () => string;
  now: () => Date;
};

export class Dossier {
  private readonly events: DossierDomainEvent[] = [];

  private constructor(private props: DossierProps) {}

  static create(input: CreateDossierInput): Result<Dossier, DossierError> {
    const dossier = new Dossier({
      id: input.id,
      organizationId: input.organizationId,
      reference: input.reference,
      learnerId: input.learnerId,
      companyId: input.companyId,
      formationId: input.formationId,
      status: 'draft',
      modality: input.modality,
      period: input.period,
      totalHours: input.totalHours,
      totalAmount: input.totalAmount,
      modules: [],
      trainers: [],
      funders: [],
      closedAt: null,
      cancelledAt: null,
      cancellationReason: null,
    });

    dossier.recordEvent({
      type: 'dossier.created',
      ...eventBase({
        organizationId: input.organizationId,
        aggregateId: input.id,
        actorUserId: input.actorUserId,
        eventId: input.newEventId(),
        occurredAt: input.now(),
      }),
      payload: {
        reference: input.reference.value,
        learnerId: input.learnerId,
        companyId: input.companyId,
        formationId: input.formationId,
        modality: input.modality,
        startDate: input.period.start.toISOString().slice(0, 10),
        endDate: input.period.end.toISOString().slice(0, 10),
        totalHours: input.totalHours.value,
      },
    });
    return ok(dossier);
  }

  static hydrate(props: DossierProps): Dossier {
    return new Dossier({
      ...props,
      modules: [...props.modules],
      trainers: [...props.trainers],
      funders: [...props.funders],
    });
  }

  get id(): DossierId {
    return this.props.id;
  }
  get organizationId(): OrganizationId {
    return this.props.organizationId;
  }
  get status(): DossierStatus {
    return this.props.status;
  }
  get reference(): DossierReference {
    return this.props.reference;
  }
  get modules(): readonly DossierModule[] {
    return this.props.modules;
  }
  get trainers(): readonly DossierTrainer[] {
    return this.props.trainers;
  }
  get funders(): readonly DossierFunder[] {
    return this.props.funders;
  }
  get period(): DateRange {
    return this.props.period;
  }
  get modality(): TrainingModality {
    return this.props.modality;
  }
  get learnerId(): LearnerId {
    return this.props.learnerId;
  }
  get companyId(): CompanyId | null {
    return this.props.companyId;
  }
  get formationId(): FormationId {
    return this.props.formationId;
  }
  get totalHours(): Hours {
    return this.props.totalHours;
  }
  get totalAmount(): Money | null {
    return this.props.totalAmount;
  }

  addModule(
    module: DossierModule,
    actor: UserId | null,
    newEventId: () => string,
    now: () => Date,
  ): Result<void, DossierError> {
    if (!isMutable(this.props.status) && this.props.status !== 'scheduled') {
      return err({ code: 'dossier_immutable', status: this.props.status });
    }
    if (this.props.modules.some((m) => m.moduleId === module.moduleId)) {
      return err({ code: 'duplicate_module' });
    }
    this.props.modules.push(module);
    this.props.modules.sort((a, b) => a.position - b.position);
    this.recordEvent({
      type: 'dossier.module-added',
      ...eventBase({
        organizationId: this.props.organizationId,
        aggregateId: this.props.id,
        actorUserId: actor,
        eventId: newEventId(),
        occurredAt: now(),
      }),
      payload: { moduleId: module.moduleId, position: module.position },
    });
    return ok(undefined);
  }

  removeModule(
    moduleId: ModuleId,
    actor: UserId | null,
    newEventId: () => string,
    now: () => Date,
  ): Result<void, DossierError> {
    if (!isMutable(this.props.status)) {
      return err({ code: 'dossier_immutable', status: this.props.status });
    }
    const idx = this.props.modules.findIndex((m) => m.moduleId === moduleId);
    if (idx === -1) return err({ code: 'unknown_module' });
    this.props.modules.splice(idx, 1);
    this.recordEvent({
      type: 'dossier.module-removed',
      ...eventBase({
        organizationId: this.props.organizationId,
        aggregateId: this.props.id,
        actorUserId: actor,
        eventId: newEventId(),
        occurredAt: now(),
      }),
      payload: { moduleId },
    });
    return ok(undefined);
  }

  assignTrainer(
    trainer: DossierTrainer,
    actor: UserId | null,
    newEventId: () => string,
    now: () => Date,
  ): Result<void, DossierError> {
    if (
      this.props.status === 'closed' ||
      this.props.status === 'archived' ||
      this.props.status === 'cancelled'
    ) {
      return err({ code: 'dossier_immutable', status: this.props.status });
    }
    if (this.props.trainers.some((t) => t.trainerId === trainer.trainerId)) {
      return err({ code: 'duplicate_trainer' });
    }
    this.props.trainers.push(trainer);
    this.recordEvent({
      type: 'dossier.trainer-assigned',
      ...eventBase({
        organizationId: this.props.organizationId,
        aggregateId: this.props.id,
        actorUserId: actor,
        eventId: newEventId(),
        occurredAt: now(),
      }),
      payload: { trainerId: trainer.trainerId, isLead: trainer.isLead },
    });
    return ok(undefined);
  }

  unassignTrainer(
    trainerId: TrainerId,
    actor: UserId | null,
    newEventId: () => string,
    now: () => Date,
  ): Result<void, DossierError> {
    const idx = this.props.trainers.findIndex((t) => t.trainerId === trainerId);
    if (idx === -1) return err({ code: 'unknown_trainer' });
    if (this.props.status === 'active' && this.props.trainers.length === 1) {
      return err({ code: 'no_trainer_assigned' });
    }
    this.props.trainers.splice(idx, 1);
    this.recordEvent({
      type: 'dossier.trainer-unassigned',
      ...eventBase({
        organizationId: this.props.organizationId,
        aggregateId: this.props.id,
        actorUserId: actor,
        eventId: newEventId(),
        occurredAt: now(),
      }),
      payload: { trainerId },
    });
    return ok(undefined);
  }

  addFunder(
    funder: DossierFunder,
    actor: UserId | null,
    newEventId: () => string,
    now: () => Date,
  ): Result<void, DossierError> {
    if (
      this.props.status === 'closed' ||
      this.props.status === 'archived' ||
      this.props.status === 'cancelled'
    ) {
      return err({ code: 'dossier_immutable', status: this.props.status });
    }
    if (this.props.funders.some((f) => f.allocation.funderId === funder.allocation.funderId)) {
      return err({ code: 'duplicate_funder' });
    }
    const next = [...this.props.funders, funder];
    const total = next.reduce(
      (acc, f) => acc + (f.allocation.share?.value ?? 0),
      0,
    );
    if (total > 100.001) return err({ code: 'funders_share_exceeds_100', total });
    this.props.funders = next;
    this.recordEvent({
      type: 'dossier.funder-added',
      ...eventBase({
        organizationId: this.props.organizationId,
        aggregateId: this.props.id,
        actorUserId: actor,
        eventId: newEventId(),
        occurredAt: now(),
      }),
      payload: {
        dossierFunderId: funder.id,
        funderId: funder.allocation.funderId,
        amountCents: funder.allocation.amount.cents,
        sharePercent: funder.allocation.share?.value ?? null,
      },
    });
    return ok(undefined);
  }

  removeFunder(
    dossierFunderId: DossierFunderId,
    actor: UserId | null,
    newEventId: () => string,
    now: () => Date,
  ): Result<void, DossierError> {
    const idx = this.props.funders.findIndex((f) => f.id === dossierFunderId);
    if (idx === -1) return err({ code: 'unknown_funder' });
    this.props.funders.splice(idx, 1);
    this.recordEvent({
      type: 'dossier.funder-removed',
      ...eventBase({
        organizationId: this.props.organizationId,
        aggregateId: this.props.id,
        actorUserId: actor,
        eventId: newEventId(),
        occurredAt: now(),
      }),
      payload: { dossierFunderId },
    });
    return ok(undefined);
  }

  submit(actor: UserId | null, newEventId: () => string, now: () => Date): Result<void, DossierError> {
    return this.transitionTo('pending_validation', { actor, newEventId, now });
  }

  schedule(actor: UserId | null, newEventId: () => string, now: () => Date): Result<void, DossierError> {
    if (this.props.modules.length === 0) return err({ code: 'no_modules' });
    if (this.props.trainers.length === 0) return err({ code: 'no_trainer_assigned' });
    return this.transitionTo('scheduled', { actor, newEventId, now });
  }

  activate(actor: UserId | null, newEventId: () => string, now: () => Date): Result<void, DossierError> {
    if (this.props.trainers.length === 0) return err({ code: 'no_trainer_assigned' });
    return this.transitionTo('active', { actor, newEventId, now });
  }

  complete(actor: UserId | null, newEventId: () => string, now: () => Date): Result<void, DossierError> {
    return this.transitionTo('completed', { actor, newEventId, now });
  }

  close(
    checklist: ClosingChecklist,
    actor: UserId | null,
    newEventId: () => string,
    now: () => Date,
  ): Result<void, DossierError> {
    const blockers: ClosingBlocker[] = [];
    if (checklist.qualiopiBlockingMissing > 0) blockers.push('qualiopi_blocking_indicators');
    if (!checklist.documentsAllSigned) blockers.push('documents_unsigned');
    if (!checklist.attendanceAllSigned) blockers.push('attendance_unsigned');
    if (!checklist.questionnairesAllCompleted) blockers.push('questionnaires_pending');
    if (blockers.length > 0) return err({ code: 'closing_blocked', reasons: blockers });

    const r = this.transitionTo('closed', { actor, newEventId, now });
    if (!r.ok) return r;
    this.props.closedAt = now();
    return ok(undefined);
  }

  reopen(
    reason: string,
    canReopen: boolean,
    actor: UserId | null,
    newEventId: () => string,
    now: () => Date,
  ): Result<void, DossierError> {
    if (!canReopen) return err({ code: 'reopen_forbidden' });
    if (!reason.trim()) return err({ code: 'invalid_inputs' });
    const guard = guardTransition(this.props.status, 'active', { canReopen: true });
    if (!guard.ok) return err(guard.error);
    this.props.status = 'active';
    this.props.closedAt = null;
    this.recordEvent({
      type: 'dossier.reopened',
      ...eventBase({
        organizationId: this.props.organizationId,
        aggregateId: this.props.id,
        actorUserId: actor,
        eventId: newEventId(),
        occurredAt: now(),
      }),
      payload: { reason },
    });
    return ok(undefined);
  }

  cancel(
    reason: string,
    actor: UserId | null,
    newEventId: () => string,
    now: () => Date,
  ): Result<void, DossierError> {
    if (!['draft', 'pending_validation', 'scheduled', 'active'].includes(this.props.status)) {
      return err({ code: 'cannot_cancel', status: this.props.status });
    }
    if (!reason.trim()) return err({ code: 'invalid_inputs' });
    const guard = guardTransition(this.props.status, 'cancelled');
    if (!guard.ok) return err(guard.error);
    this.props.status = 'cancelled';
    this.props.cancelledAt = now();
    this.props.cancellationReason = reason;
    this.recordEvent({
      type: 'dossier.cancelled',
      ...eventBase({
        organizationId: this.props.organizationId,
        aggregateId: this.props.id,
        actorUserId: actor,
        eventId: newEventId(),
        occurredAt: now(),
      }),
      payload: { reason },
    });
    return ok(undefined);
  }

  archive(actor: UserId | null, newEventId: () => string, now: () => Date): Result<void, DossierError> {
    return this.transitionTo('archived', { actor, newEventId, now });
  }

  pullEvents(): readonly DossierDomainEvent[] {
    const out = [...this.events];
    this.events.length = 0;
    return out;
  }

  private recordEvent(e: DossierDomainEvent): void {
    this.events.push(e);
  }

  private transitionTo(
    to: DossierStatus,
    ctx: { actor: UserId | null; newEventId: () => string; now: () => Date },
  ): Result<void, DossierError> {
    const guard = guardTransition(this.props.status, to);
    if (!guard.ok) return err(guard.error);
    this.props.status = to;
    const base = eventBase({
      organizationId: this.props.organizationId,
      aggregateId: this.props.id,
      actorUserId: ctx.actor,
      eventId: ctx.newEventId(),
      occurredAt: ctx.now(),
    });
    switch (to) {
      case 'pending_validation':
        this.recordEvent({ type: 'dossier.submitted', ...base, payload: {} });
        break;
      case 'scheduled':
        this.recordEvent({ type: 'dossier.scheduled', ...base, payload: {} });
        break;
      case 'active':
        this.recordEvent({ type: 'dossier.activated', ...base, payload: {} });
        break;
      case 'completed':
        this.recordEvent({ type: 'dossier.completed', ...base, payload: {} });
        break;
      case 'closed':
        this.recordEvent({
          type: 'dossier.closed',
          ...base,
          payload: { closedAt: ctx.now().toISOString() },
        });
        break;
      case 'archived':
        this.recordEvent({ type: 'dossier.archived', ...base, payload: {} });
        break;
    }
    return ok(undefined);
  }
}
