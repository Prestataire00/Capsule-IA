import type { AttendanceSheetId, SignatureId } from './ids';
import type { OrganizationId, DossierId } from '@/features/dossier/domain/ids';
import type { HalfDay } from './half-day';
import type { EvidenceSource } from './evidence-source';

type Base = {
  readonly id: string;
  readonly organizationId: OrganizationId;
  readonly aggregateId: AttendanceSheetId;
  readonly occurredAt: Date;
};

export type AttendanceSheetCreated = Base & {
  readonly kind: 'AttendanceSheetCreated';
  readonly dossierId: DossierId;
  readonly halfDay: HalfDay;
};

export type SignatureRecorded = Base & {
  readonly kind: 'SignatureRecorded';
  readonly signatureId: SignatureId;
  readonly signerKind: 'learner' | 'trainer';
  readonly signerId: string;
  readonly evidenceSource: EvidenceSource;
};

export type AttendanceSheetFinalized = Base & {
  readonly kind: 'AttendanceSheetFinalized';
  readonly documentId: string;
  readonly documentHash: string;
};

export type ZoomAttendanceImported = Base & {
  readonly kind: 'ZoomAttendanceImported';
  readonly matched: number;
  readonly unmatched: number;
  readonly source: 'zoom_csv' | 'zoom_api';
};

export type AttendanceDomainEvent =
  | AttendanceSheetCreated
  | SignatureRecorded
  | AttendanceSheetFinalized
  | ZoomAttendanceImported;
