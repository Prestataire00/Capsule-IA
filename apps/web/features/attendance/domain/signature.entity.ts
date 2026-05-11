import type { Result } from '@/shared/lib/result';
import { ok, err } from '@/shared/lib/result';
import type { LearnerId, TrainerId } from '@/features/dossier/domain/ids';
import type { SignatureId, TokenJti } from './ids';
import type { AttendanceStatus } from './attendance-status';
import type { EvidenceSource } from './evidence-source';
import { requiresImageHash } from './evidence-source';
import type { SignerKind } from './signer-token.vo';

export type SignatureProps = {
  readonly id: SignatureId;
  readonly signerKind: SignerKind;
  readonly learnerId: LearnerId | null;
  readonly trainerId: TrainerId | null;
  readonly status: AttendanceStatus | null;
  readonly signedAt: Date | null;
  readonly signerIp: string | null;
  readonly signerUserAgent: string | null;
  readonly signerCountry: string | null;
  readonly signaturePngPath: string | null;
  readonly signatureHash: string | null;
  readonly tokenJti: TokenJti | null;
  readonly evidenceSource: EvidenceSource;
  readonly evidencePayload: Record<string, unknown> | null;
  readonly notes: string | null;
};

export type SignatureError =
  | { code: 'kind_id_mismatch' }
  | { code: 'present_missing_hash' }
  | { code: 'present_missing_ip' }
  | { code: 'present_missing_signed_at' };

export class Signature {
  private constructor(public readonly props: SignatureProps) {}

  static rehydrate(props: SignatureProps): Signature {
    return new Signature(props);
  }

  static recordPresent(args: {
    id: SignatureId;
    signerKind: SignerKind;
    learnerId: LearnerId | null;
    trainerId: TrainerId | null;
    signedAt: Date;
    signerIp: string;
    signerUserAgent: string | null;
    signerCountry: string | null;
    signaturePngPath: string | null;
    signatureHash: string | null;
    tokenJti: TokenJti | null;
    evidenceSource: EvidenceSource;
    evidencePayload: Record<string, unknown> | null;
  }): Result<Signature, SignatureError> {
    const kindIdMismatch =
      (args.signerKind === 'learner' && (!args.learnerId || args.trainerId)) ||
      (args.signerKind === 'trainer' && (!args.trainerId || args.learnerId));
    if (kindIdMismatch) return err({ code: 'kind_id_mismatch' });

    if (requiresImageHash(args.evidenceSource) && !args.signatureHash) {
      return err({ code: 'present_missing_hash' });
    }
    if (!args.signerIp) return err({ code: 'present_missing_ip' });

    return ok(
      new Signature({
        id: args.id,
        signerKind: args.signerKind,
        learnerId: args.learnerId,
        trainerId: args.trainerId,
        status: 'present',
        signedAt: args.signedAt,
        signerIp: args.signerIp,
        signerUserAgent: args.signerUserAgent,
        signerCountry: args.signerCountry,
        signaturePngPath: args.signaturePngPath,
        signatureHash: args.signatureHash,
        tokenJti: args.tokenJti,
        evidenceSource: args.evidenceSource,
        evidencePayload: args.evidencePayload,
        notes: null,
      }),
    );
  }

  override(status: AttendanceStatus, notes: string | null): Signature {
    return new Signature({
      ...this.props,
      status,
      notes,
      evidenceSource: 'trainer_override',
    });
  }

  get isComplete(): boolean {
    return this.props.status !== null;
  }
}
