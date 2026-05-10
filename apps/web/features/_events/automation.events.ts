import { z } from 'zod';
import { defineEvent, z_uuid, z_isoDatetime } from './envelope';

export const WorkflowTriggered = defineEvent({
  type: 'automation.workflow.triggered',
  aggregateType: 'workflow_run',
  payload: {
    workflowId: z_uuid,
    triggeredByEventId: z_uuid.nullable(),
    triggeredByEventType: z.string().nullable(),
    startedAt: z_isoDatetime,
  },
});

export const WorkflowFailed = defineEvent({
  type: 'automation.workflow.failed',
  aggregateType: 'workflow_run',
  payload: {
    workflowId: z_uuid,
    error: z.string().min(1),
    failedStep: z.string().nullable(),
    movedToDeadLetter: z.boolean(),
  },
});
