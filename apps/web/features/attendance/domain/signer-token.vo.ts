import type { Result } from '@/shared/lib/result';
import { ok, err } from '@/shared/lib/result';
import type { AttendanceSheetId, TokenJti } from './ids';

export type SignerKind = 'learner' | 'trainer';

export type SignerTokenPayload = {
  readonly sheetId: AttendanceSheetId;
  readonly signerId: string;
  readonly signerKind: SignerKind;
  readonly jti: TokenJti;
  readonly issuedAt: Date;
  readonly expiresAt: Date;
};

export type SignerTokenError =
  | { code: 'expired' }
  | { code: 'invalid_kind'; received: string }
  | { code: 'expires_before_issued' };

export const createSignerTokenPayload = (params: {
  sheetId: AttendanceSheetId;
  signerId: string;
  signerKind: string;
  jti: TokenJti;
  issuedAt: Date;
  expiresAt: Date;
  now?: Date;
}): Result<SignerTokenPayload, SignerTokenError> => {
  if (params.signerKind !== 'learner' && params.signerKind !== 'trainer') {
    return err({ code: 'invalid_kind', received: params.signerKind });
  }
  if (params.expiresAt <= params.issuedAt) {
    return err({ code: 'expires_before_issued' });
  }
  const now = params.now ?? new Date();
  if (params.expiresAt <= now) {
    return err({ code: 'expired' });
  }
  return ok({
    sheetId: params.sheetId,
    signerId: params.signerId,
    signerKind: params.signerKind,
    jti: params.jti,
    issuedAt: params.issuedAt,
    expiresAt: params.expiresAt,
  });
};

/** TTL en secondes selon le purpose du token. */
export const TTL_QR_LIVE_SECONDS = 30 * 60;
export const TTL_EMAIL_LINK_SECONDS = 24 * 60 * 60;
export const TTL_TRAINER_OVERRIDE_SECONDS = 7 * 24 * 60 * 60;
