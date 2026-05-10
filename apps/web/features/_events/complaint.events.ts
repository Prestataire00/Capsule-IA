import { z } from 'zod';
import { defineEvent, z_uuid, z_isoDatetime } from './envelope';

export const ComplaintOpened = defineEvent({
  type: 'complaint.opened',
  aggregateType: 'complaint',
  payload: {
    reference: z.string().regex(/^REC-\d{4}-\d{4,}$/),
    severity: z.enum(['low', 'medium', 'high', 'critical']),
    source: z.enum(['email', 'phone', 'questionnaire', 'in_person', 'other']),
    dossierId: z_uuid.nullable(),
    learnerId: z_uuid.nullable(),
  },
});

export const ComplaintAssigned = defineEvent({
  type: 'complaint.assigned',
  aggregateType: 'complaint',
  payload: { assignedTo: z_uuid },
});

export const ComplaintResolved = defineEvent({
  type: 'complaint.resolved',
  aggregateType: 'complaint',
  payload: { resolvedAt: z_isoDatetime, resolution: z.string().min(1) },
});
