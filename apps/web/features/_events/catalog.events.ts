import { z } from 'zod';
import { defineEvent } from './envelope';

export const FormationPublished = defineEvent({
  type: 'catalog.formation.published',
  aggregateType: 'formation',
  payload: {
    code: z.string().min(1),
    title: z.string().min(1),
    publishedAt: z.coerce.date(),
  },
});

export const FormationArchived = defineEvent({
  type: 'catalog.formation.archived',
  aggregateType: 'formation',
  payload: {
    reason: z.string().nullable(),
  },
});

export const ModuleUpdated = defineEvent({
  type: 'catalog.module.updated',
  aggregateType: 'module',
  payload: {
    changedFields: z.array(z.string()),
  },
});
