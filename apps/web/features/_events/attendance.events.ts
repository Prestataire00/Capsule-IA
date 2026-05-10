import { z } from 'zod';
import { defineEvent, z_uuid, z_isoDatetime } from './envelope';

export const AttendanceSheetOpened = defineEvent({
  type: 'attendance.sheet.opened',
  aggregateType: 'attendance_sheet',
  payload: {
    sessionId: z_uuid,
    dossierId: z_uuid,
    halfDay: z.enum(['morning', 'afternoon', 'full', 'evening']),
  },
});

export const AttendanceSignatureCaptured = defineEvent({
  type: 'attendance.signature.captured',
  aggregateType: 'attendance_sheet',
  payload: {
    signatureId: z_uuid,
    participantKind: z.enum(['learner', 'trainer']),
    participantId: z_uuid,
    signedAt: z_isoDatetime,
    signerIp: z.string().ip().nullable(),
    signerUserAgent: z.string().nullable(),
  },
});

export const AttendanceSheetCompleted = defineEvent({
  type: 'attendance.sheet.completed',
  aggregateType: 'attendance_sheet',
  payload: {
    finalizedAt: z_isoDatetime,
    finalizedBy: z_uuid.nullable(),
    expectedSignatures: z.number().int().nonnegative(),
    capturedSignatures: z.number().int().nonnegative(),
  },
});

export const AttendanceMissingDetected = defineEvent({
  type: 'attendance.missing.detected',
  aggregateType: 'attendance_sheet',
  payload: {
    sessionId: z_uuid,
    dossierId: z_uuid,
    missingFor: z.array(z.object({
      participantKind: z.enum(['learner', 'trainer']),
      participantId: z_uuid,
    })),
    detectedAt: z_isoDatetime,
  },
});
