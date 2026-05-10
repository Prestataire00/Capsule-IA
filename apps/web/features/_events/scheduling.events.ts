import { z } from 'zod';
import { defineEvent, z_uuid, z_isoDatetime, z_modality } from './envelope';

const aggregateType = 'session' as const;

export const SessionCreated = defineEvent({
  type: 'scheduling.session.created',
  aggregateType,
  payload: {
    dossierId: z_uuid,
    dossierModuleId: z_uuid.nullable(),
    startsAt: z_isoDatetime,
    endsAt: z_isoDatetime,
    modality: z_modality,
    location: z.string().nullable(),
  },
});

export const SessionUpdated = defineEvent({
  type: 'scheduling.session.updated',
  aggregateType,
  payload: {
    changedFields: z.array(z.string()),
    startsAt: z_isoDatetime.optional(),
    endsAt: z_isoDatetime.optional(),
  },
});

export const SessionCancelled = defineEvent({
  type: 'scheduling.session.cancelled',
  aggregateType,
  payload: { reason: z.string().min(1) },
});

export const ZoomMeetingLinked = defineEvent({
  type: 'scheduling.zoom-meeting.linked',
  aggregateType,
  payload: {
    zoomMeetingId: z.string(),
    joinUrl: z.string().url(),
    hostUrl: z.string().url().nullable(),
  },
});
