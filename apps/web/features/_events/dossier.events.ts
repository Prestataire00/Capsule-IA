import { z } from 'zod';
import {
  defineEvent, z_uuid, z_isoDate, z_isoDatetime, z_modality, z_dossierStatus, z_currency,
} from './envelope';

const aggregateType = 'dossier' as const;

export const DossierCreated = defineEvent({
  type: 'dossier.created',
  aggregateType,
  payload: {
    reference: z.string().regex(/^DOS-\d{4}-\d{4,}$/),
    learnerId: z_uuid,
    companyId: z_uuid.nullable(),
    formationId: z_uuid,
    modality: z_modality,
    startDate: z_isoDate,
    endDate: z_isoDate,
    totalHours: z.number().positive(),
    totalAmountCents: z.number().int().nonnegative().nullable(),
    currency: z_currency,
  },
});

export const DossierModuleAdded = defineEvent({
  type: 'dossier.module-added',
  aggregateType,
  payload: {
    dossierModuleId: z_uuid,
    moduleId: z_uuid,
    position: z.number().int().nonnegative(),
    durationHours: z.number().positive(),
  },
});

export const DossierModuleRemoved = defineEvent({
  type: 'dossier.module-removed',
  aggregateType,
  payload: { dossierModuleId: z_uuid, moduleId: z_uuid },
});

export const DossierTrainerAssigned = defineEvent({
  type: 'dossier.trainer-assigned',
  aggregateType,
  payload: {
    trainerId: z_uuid,
    isLead: z.boolean(),
    hourlyRateCents: z.number().int().nonnegative().nullable(),
  },
});

export const DossierTrainerUnassigned = defineEvent({
  type: 'dossier.trainer-unassigned',
  aggregateType,
  payload: { trainerId: z_uuid },
});

export const DossierFunderAdded = defineEvent({
  type: 'dossier.funder-added',
  aggregateType,
  payload: {
    dossierFunderId: z_uuid,
    funderId: z_uuid,
    amountCents: z.number().int().nonnegative(),
    sharePercent: z.number().min(0).max(100).nullable(),
  },
});

export const DossierFunderRemoved = defineEvent({
  type: 'dossier.funder-removed',
  aggregateType,
  payload: { dossierFunderId: z_uuid },
});

export const DossierSubmitted = defineEvent({
  type: 'dossier.submitted',
  aggregateType,
  payload: { fromStatus: z_dossierStatus },
});

export const DossierScheduled = defineEvent({
  type: 'dossier.scheduled',
  aggregateType,
  payload: {
    fromStatus: z_dossierStatus,
    plannedSessionsCount: z.number().int().nonnegative().default(0),
  },
});

export const DossierActivated = defineEvent({
  type: 'dossier.activated',
  aggregateType,
  payload: { fromStatus: z_dossierStatus, activatedAt: z_isoDatetime },
});

export const DossierCompleted = defineEvent({
  type: 'dossier.completed',
  aggregateType,
  payload: { fromStatus: z_dossierStatus, completedAt: z_isoDatetime },
});

export const DossierClosed = defineEvent({
  type: 'dossier.closed',
  aggregateType,
  payload: {
    fromStatus: z_dossierStatus,
    closedAt: z_isoDatetime,
    qualiopiSnapshot: z.object({
      totalIndicators: z.number().int().nonnegative(),
      satisfiedIndicators: z.number().int().nonnegative(),
    }),
  },
});

export const DossierReopened = defineEvent({
  type: 'dossier.reopened',
  aggregateType,
  payload: { reason: z.string().min(1), reopenedBy: z_uuid },
});

export const DossierCancelled = defineEvent({
  type: 'dossier.cancelled',
  aggregateType,
  payload: { reason: z.string().min(1), cancelledAt: z_isoDatetime },
});

export const DossierArchived = defineEvent({
  type: 'dossier.archived',
  aggregateType,
  payload: {},
});
