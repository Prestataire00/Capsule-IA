import type { Result } from '@/shared/lib/result';
import { ok, err } from '@/shared/lib/result';
import type { AttendanceSheetId, SessionId } from './ids';
import type { OrganizationId, DossierId, UserId } from '@/features/dossier/domain/ids';
import type { HalfDay } from './half-day';
import type { AttendanceSplitStrategy } from './attendance-split-strategy';
import { Signature } from './signature.entity';
import type { AttendanceError } from './attendance.errors';
import type { AttendanceDomainEvent } from './attendance.events';

export type AttendanceSheetStatus = 'open' | 'partial' | 'completed' | 'finalized';

export type AttendanceSheetProps = {
  readonly id: AttendanceSheetId;
  readonly organizationId: OrganizationId;
  readonly dossierId: DossierId;
  readonly sessionId: SessionId;
  readonly halfDay: HalfDay;
  readonly splitStrategy: AttendanceSplitStrategy;
  status: AttendanceSheetStatus;
  signatures: Signature[];
  finalizedAt: Date | null;
  finalizedBy: UserId | null;
  documentId: string | null;
};

export class AttendanceSheet {
  private readonly _events: AttendanceDomainEvent[] = [];

  private constructor(private props: AttendanceSheetProps) {}

  static rehydrate(props: AttendanceSheetProps): AttendanceSheet {
    return new AttendanceSheet(props);
  }

  static create(args: {
    id: AttendanceSheetId;
    organizationId: OrganizationId;
    dossierId: DossierId;
    sessionId: SessionId;
    halfDay: HalfDay;
    splitStrategy: AttendanceSplitStrategy;
    newEventId: () => string;
    now: () => Date;
  }): AttendanceSheet {
    const sheet = new AttendanceSheet({
      id: args.id,
      organizationId: args.organizationId,
      dossierId: args.dossierId,
      sessionId: args.sessionId,
      halfDay: args.halfDay,
      splitStrategy: args.splitStrategy,
      status: 'open',
      signatures: [],
      finalizedAt: null,
      finalizedBy: null,
      documentId: null,
    });
    sheet._events.push({
      id: args.newEventId(),
      organizationId: args.organizationId,
      aggregateId: args.id,
      occurredAt: args.now(),
      kind: 'AttendanceSheetCreated',
      dossierId: args.dossierId,
      halfDay: args.halfDay,
    });
    return sheet;
  }

  private recomputeStatus(): void {
    if (this.props.status === 'finalized') return;
    const total = this.props.signatures.length;
    if (total === 0) {
      this.props.status = 'open';
      return;
    }
    const complete = this.props.signatures.filter((s) => s.isComplete).length;
    this.props.status =
      complete === 0 ? 'open' : complete < total ? 'partial' : 'completed';
  }

  addOrReplaceSignature(
    sig: Signature,
    now: Date,
    newEventId: () => string,
  ): Result<void, AttendanceError> {
    if (this.props.status === 'finalized') return err({ code: 'already_finalized' });

    const signerId = sig.props.learnerId ?? sig.props.trainerId;
    const idx = this.props.signatures.findIndex(
      (s) =>
        s.props.signerKind === sig.props.signerKind &&
        (s.props.learnerId ?? s.props.trainerId) === signerId,
    );
    if (idx >= 0) {
      this.props.signatures[idx] = sig;
    } else {
      this.props.signatures.push(sig);
    }
    this.recomputeStatus();
    this._events.push({
      id: newEventId(),
      organizationId: this.props.organizationId,
      aggregateId: this.props.id,
      occurredAt: now,
      kind: 'SignatureRecorded',
      signatureId: sig.props.id,
      signerKind: sig.props.signerKind,
      signerId: signerId ?? '',
      evidenceSource: sig.props.evidenceSource,
    });
    return ok(undefined);
  }

  finalize(args: {
    documentId: string;
    documentHash: string;
    finalizedBy: UserId;
    now: Date;
    newEventId: () => string;
  }): Result<void, AttendanceError> {
    if (this.props.status === 'finalized') return err({ code: 'already_finalized' });
    const missing = this.props.signatures.filter((s) => !s.isComplete);
    if (missing.length > 0) {
      return err({
        code: 'missing_signatures',
        signerIds: missing.map(
          (s) => (s.props.learnerId ?? s.props.trainerId ?? '') as string,
        ),
      });
    }
    this.props.status = 'finalized';
    this.props.finalizedAt = args.now;
    this.props.finalizedBy = args.finalizedBy;
    this.props.documentId = args.documentId;
    this._events.push({
      id: args.newEventId(),
      organizationId: this.props.organizationId,
      aggregateId: this.props.id,
      occurredAt: args.now,
      kind: 'AttendanceSheetFinalized',
      documentId: args.documentId,
      documentHash: args.documentHash,
    });
    return ok(undefined);
  }

  get snapshot(): Readonly<AttendanceSheetProps> {
    return this.props;
  }

  get events(): readonly AttendanceDomainEvent[] {
    return this._events;
  }
}
