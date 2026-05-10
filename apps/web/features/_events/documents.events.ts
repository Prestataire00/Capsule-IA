import { z } from 'zod';
import { defineEvent, z_uuid, z_isoDatetime } from './envelope';

export const DocumentTemplatePublished = defineEvent({
  type: 'documents.template.published',
  aggregateType: 'document_template',
  payload: {
    code: z.string().min(1),
    version: z.number().int().positive(),
    fileHash: z.string().regex(/^[a-f0-9]{64}$/),
  },
});

export const DocumentGenerated = defineEvent({
  type: 'documents.document.generated',
  aggregateType: 'document',
  payload: {
    dossierId: z_uuid.nullable(),
    templateId: z_uuid.nullable(),
    templateVersionId: z_uuid.nullable(),
    kind: z.string().min(1),
    storagePath: z.string().min(1),
    fileHash: z.string().regex(/^[a-f0-9]{64}$/),
    version: z.number().int().positive(),
    generatedAt: z_isoDatetime,
  },
});

export const DocumentRegenerated = defineEvent({
  type: 'documents.document.regenerated',
  aggregateType: 'document',
  payload: {
    parentDocumentId: z_uuid,
    reason: z.string().min(1),
    newVersion: z.number().int().positive(),
  },
});

export const DocumentGenerationFailed = defineEvent({
  type: 'documents.document.failed',
  aggregateType: 'document',
  payload: {
    error: z.string().min(1),
    attempts: z.number().int().positive(),
  },
});

export const SignatureRequested = defineEvent({
  type: 'documents.signature.requested',
  aggregateType: 'document_signature',
  payload: {
    documentId: z_uuid,
    signerKind: z.enum(['learner', 'trainer', 'company_rep', 'org_rep']),
    signerEmail: z.string().email(),
    signerName: z.string().nullable(),
    expiresAt: z_isoDatetime,
  },
});

export const SignatureCompleted = defineEvent({
  type: 'documents.signature.completed',
  aggregateType: 'document_signature',
  payload: {
    documentId: z_uuid,
    signerKind: z.enum(['learner', 'trainer', 'company_rep', 'org_rep']),
    signedAt: z_isoDatetime,
    signerIp: z.string().ip().nullable(),
    documentHashAtSignature: z.string().regex(/^[a-f0-9]{64}$/),
  },
});

export const SignatureDeclined = defineEvent({
  type: 'documents.signature.declined',
  aggregateType: 'document_signature',
  payload: {
    documentId: z_uuid,
    declineReason: z.string().min(1),
  },
});

export const SignatureExpired = defineEvent({
  type: 'documents.signature.expired',
  aggregateType: 'document_signature',
  payload: { documentId: z_uuid, expiredAt: z_isoDatetime },
});
