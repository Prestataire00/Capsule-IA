import { z } from 'zod';
import { defineEvent, z_uuid } from './envelope';

export const CompanyCreated = defineEvent({
  type: 'crm.company.created',
  aggregateType: 'company',
  payload: {
    name: z.string().min(1),
    siret: z.string().length(14).nullable(),
  },
});

export const LearnerCreated = defineEvent({
  type: 'crm.learner.created',
  aggregateType: 'learner',
  payload: {
    firstName: z.string().min(1),
    lastName: z.string().min(1),
    email: z.string().email(),
    companyId: z_uuid.nullable(),
  },
});

export const LearnerLinkedToCompany = defineEvent({
  type: 'crm.learner.linked-to-company',
  aggregateType: 'learner',
  payload: {
    companyId: z_uuid,
    previousCompanyId: z_uuid.nullable(),
  },
});

export const LearnerAnonymized = defineEvent({
  type: 'crm.learner.anonymized',
  aggregateType: 'learner',
  payload: {
    reason: z.enum(['user_request', 'retention_policy', 'manual']),
    requestedBy: z_uuid.nullable(),
    redactedFields: z.array(z.string()),
  },
});
