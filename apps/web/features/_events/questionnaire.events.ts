import { z } from 'zod';
import { defineEvent, z_uuid, z_isoDatetime } from './envelope';

const questionnaireKind = z.enum([
  'positionnement', 'satisfaction_chaud', 'satisfaction_froid',
  'opco', 'evaluation_acquis', 'custom',
]);

export const QuestionnaireAssigned = defineEvent({
  type: 'questionnaire.assigned',
  aggregateType: 'questionnaire_assignment',
  payload: {
    templateId: z_uuid,
    kind: questionnaireKind,
    dossierId: z_uuid,
    recipientKind: z.enum(['learner', 'trainer', 'company_rep']),
    recipientEmail: z.string().email(),
    dueAt: z_isoDatetime.nullable(),
  },
});

export const QuestionnaireCompleted = defineEvent({
  type: 'questionnaire.completed',
  aggregateType: 'questionnaire_assignment',
  payload: {
    responseId: z_uuid,
    dossierId: z_uuid,
    kind: questionnaireKind,
    nps: z.number().int().min(0).max(10).nullable(),
    score: z.number().nullable(),
    submittedAt: z_isoDatetime,
  },
});

export const QuestionnaireExpired = defineEvent({
  type: 'questionnaire.expired',
  aggregateType: 'questionnaire_assignment',
  payload: {
    dossierId: z_uuid,
    kind: questionnaireKind,
    expiredAt: z_isoDatetime,
    remindersSent: z.number().int().nonnegative(),
  },
});
