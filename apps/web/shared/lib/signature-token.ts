import 'server-only';
import { SignJWT, jwtVerify } from 'jose';
import { randomUUID } from 'node:crypto';
import { env } from '@/env.mjs';
import { ok, err, type Result } from '@/shared/lib/result';

const ISSUER = 'i-a-infinity-of';
const AUDIENCE = 'signature';
const TTL_SECONDS = 24 * 60 * 60; // 24h

const signingKey = (): Uint8Array => {
  try {
    return Uint8Array.from(Buffer.from(env.TOKEN_SIGNING_KEY, 'base64'));
  } catch {
    return new TextEncoder().encode(env.TOKEN_SIGNING_KEY);
  }
};

export type SignaturePayload = {
  readonly attendanceSheetId: string;
  readonly signerId: string;
  readonly signerKind: 'learner' | 'trainer';
};

export type SignedToken = {
  readonly token: string;
  readonly jti: string;
  readonly expiresAt: Date;
};

export type SignatureTokenError =
  | 'invalid_token'
  | 'expired_token'
  | 'invalid_payload';

/**
 * `emission` : identifiant et échéance d'un jeton déjà enregistré en base,
 * pour le ré-émettre à l'identique (voir `issueAttendanceLink`).
 */
export const generateSignatureToken = async (
  payload: SignaturePayload,
  emission?: { readonly jti: string; readonly expiresAt: Date },
): Promise<SignedToken> => {
  const jti = emission?.jti ?? randomUUID();
  const expiresAt = emission?.expiresAt ?? new Date(Date.now() + TTL_SECONDS * 1000);

  const token = await new SignJWT({
    sheet: payload.attendanceSheetId,
    sub: payload.signerId,
    kind: payload.signerKind,
  })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(Math.floor(expiresAt.getTime() / 1000))
    .setJti(jti)
    .sign(signingKey());

  return { token, jti, expiresAt };
};

export const verifySignatureToken = async (
  token: string,
): Promise<Result<SignaturePayload & { jti: string }, SignatureTokenError>> => {
  try {
    const { payload } = await jwtVerify(token, signingKey(), {
      issuer: ISSUER,
      audience: AUDIENCE,
      algorithms: ['HS256'],
    });

    if (
      typeof payload.sheet !== 'string' ||
      typeof payload.sub !== 'string' ||
      typeof payload.kind !== 'string' ||
      typeof payload.jti !== 'string' ||
      (payload.kind !== 'learner' && payload.kind !== 'trainer')
    ) {
      return err('invalid_payload');
    }

    return ok({
      attendanceSheetId: payload.sheet,
      signerId: payload.sub,
      signerKind: payload.kind,
      jti: payload.jti,
    });
  } catch (e) {
    const code = (e as { code?: string })?.code;
    if (code === 'ERR_JWT_EXPIRED') return err('expired_token');
    return err('invalid_token');
  }
};
