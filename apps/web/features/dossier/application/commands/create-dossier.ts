import type { Result } from '@/shared/lib/result';
import { ok, err } from '@/shared/lib/result';
import { DateRange } from '../../domain/value-objects/date-range';
import { Hours } from '../../domain/value-objects/hours';
import { Money, type Currency } from '../../domain/value-objects/money';
import {
  isTrainingModality,
  type TrainingModality,
} from '../../domain/value-objects/training-modality';
import { Dossier } from '../../domain/dossier.entity';
import type { DossierError } from '../../domain/dossier.errors';
import {
  CompanyId,
  DossierId,
  FormationId,
  LearnerId,
  OrganizationId,
  UserId,
} from '../../domain/ids';
import type { DossierRepository } from '../ports/dossier.repository';
import type { ReferenceGenerator, IdGenerator } from '../ports/reference-generator';
import type { Clock } from '../ports/clock';

export type CreateDossierInput = {
  organizationId: OrganizationId;
  learnerId: LearnerId;
  companyId: CompanyId | null;
  formationId: FormationId;
  modality: string;
  startDate: string;
  endDate: string;
  totalHours: number;
  totalAmountCents: number | null;
  currency?: Currency;
  actorUserId: UserId | null;
};

export type CreateDossierOutput = {
  dossierId: DossierId;
  reference: string;
};

export type CreateDossierDeps = {
  repo: DossierRepository;
  refs: ReferenceGenerator;
  ids: IdGenerator;
  clock: Clock;
};

export const createDossier =
  (deps: CreateDossierDeps) =>
  async (
    input: CreateDossierInput,
  ): Promise<Result<CreateDossierOutput, DossierError>> => {
    if (!isTrainingModality(input.modality)) return err({ code: 'invalid_modality' });

    const start = new Date(input.startDate);
    const end = new Date(input.endDate);
    const periodR = DateRange.create(start, end);
    if (!periodR.ok) return err({ code: 'invalid_period' });

    const hoursR = Hours.create(input.totalHours);
    if (!hoursR.ok) return err({ code: 'invalid_inputs' });

    const moneyR =
      input.totalAmountCents === null
        ? ({ ok: true, value: null } as const)
        : Money.create(input.totalAmountCents, input.currency ?? 'EUR');
    if (!moneyR.ok) return err({ code: 'invalid_inputs' });

    const reference = await deps.refs.nextDossierReference(
      input.organizationId,
      start.getUTCFullYear(),
    );

    const id = DossierId(deps.ids.newUuidV7());

    const dossierR = Dossier.create({
      id,
      organizationId: input.organizationId,
      reference,
      learnerId: input.learnerId,
      companyId: input.companyId,
      formationId: input.formationId,
      modality: input.modality as TrainingModality,
      period: periodR.value,
      totalHours: hoursR.value,
      totalAmount: moneyR.value as Money | null,
      actorUserId: input.actorUserId,
      newEventId: () => deps.ids.newUuidV7(),
      now: () => deps.clock.now(),
    });
    if (!dossierR.ok) return dossierR;

    await deps.repo.save(dossierR.value);
    return ok({ dossierId: id, reference: reference.value });
  };
