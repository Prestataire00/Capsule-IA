import { z } from 'zod';
import { defineEvent, z_uuid, z_isoDatetime } from './envelope';

export const QualiopiProofAttached = defineEvent({
  type: 'qualiopi.proof.attached',
  aggregateType: 'qualiopi_proof',
  payload: {
    indicatorCode: z.string().regex(/^I([1-9]|[12][0-9]|3[0-2])$/),
    scope: z.enum(['organization', 'dossier']),
    dossierId: z_uuid.nullable(),
    documentId: z_uuid.nullable(),
    externalPath: z.string().nullable(),
  },
});

export const QualiopiChecklistRecomputed = defineEvent({
  type: 'qualiopi.checklist.recomputed',
  aggregateType: 'dossier',
  payload: {
    totalIndicators: z.number().int().nonnegative(),
    satisfiedIndicators: z.number().int().nonnegative(),
    blockingMissing: z.number().int().nonnegative(),
    isReady: z.boolean(),
    triggeredBy: z.enum(['cron', 'event', 'manual']),
  },
});

export const QualiopiAuditExported = defineEvent({
  type: 'qualiopi.audit.exported',
  aggregateType: 'organization',
  payload: {
    exportId: z_uuid,
    storagePath: z.string().min(1),
    indicatorsCount: z.number().int().nonnegative(),
    proofsCount: z.number().int().nonnegative(),
    requestedBy: z_uuid,
    exportedAt: z_isoDatetime,
  },
});
