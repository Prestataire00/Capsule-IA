import 'server-only';
import { SignJWT, jwtVerify } from 'jose';
import { randomUUID } from 'node:crypto';
import { env } from '@/env.mjs';
import { ok, err, type Result } from '@/shared/lib/result';

const ISSUER = 'i-a-infinity-of';
const AUDIENCE = 'apprenant';
const TTL_SECONDS = 90 * 24 * 60 * 60; // 90 jours — durée moyenne d'une formation

const signingKey = (): Uint8Array => {
  try {
    return Uint8Array.from(Buffer.from(env.TOKEN_SIGNING_KEY, 'base64'));
  } catch {
    return new TextEncoder().encode(env.TOKEN_SIGNING_KEY);
  }
};

export type ApprenantPayload = {
  readonly learnerId: string;
  readonly organizationId: string;
  readonly dossierId: string;
};

export type ApprenantSignedToken = {
  readonly token: string;
  readonly jti: string;
  readonly expiresAt: Date;
};

export type ApprenantTokenError =
  | 'invalid_token'
  | 'expired_token'
  | 'revoked_token'
  | 'invalid_payload';

export const generateApprenantToken = async (
  payload: ApprenantPayload,
): Promise<ApprenantSignedToken> => {
  const jti = randomUUID();
  const expiresAt = new Date(Date.now() + TTL_SECONDS * 1000);

  const token = await new SignJWT({
    sub: payload.learnerId,
    org: payload.organizationId,
    dos: payload.dossierId,
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

export const verifyApprenantToken = async (
  token: string,
): Promise<Result<ApprenantPayload & { jti: string }, ApprenantTokenError>> => {
  try {
    const { payload } = await jwtVerify(token, signingKey(), {
      issuer: ISSUER,
      audience: AUDIENCE,
      algorithms: ['HS256'],
    });

    if (
      typeof payload.sub !== 'string' ||
      typeof payload.org !== 'string' ||
      typeof payload.dos !== 'string' ||
      typeof payload.jti !== 'string'
    ) {
      return err('invalid_payload');
    }

    // Révocation par dossier (audit CAP-14) : un lien transféré ou envoyé à la
    // mauvaise adresse doit pouvoir être coupé sans changer la clé de signature.
    const { isLinkRevoked } = await import('@/shared/lib/link-revocation');
    if (await isLinkRevoked(typeof payload.dos === 'string' ? payload.dos : null, payload.iat)) {
      return err('revoked_token');
    }

    return ok({
      learnerId: payload.sub,
      organizationId: payload.org,
      dossierId: payload.dos,
      jti: payload.jti,
    });
  } catch (e) {
    const code = (e as { code?: string })?.code;
    if (code === 'ERR_JWT_EXPIRED') return err('expired_token');
    return err('invalid_token');
  }
};

export const generateApprenantUrl = async (
  payload: ApprenantPayload,
  baseUrl: string,
): Promise<{ url: string; token: string; expiresAt: Date }> => {
  const signed = await generateApprenantToken(payload);
  return {
    url: `${baseUrl.replace(/\/$/, '')}/espace/${signed.token}`,
    token: signed.token,
    expiresAt: signed.expiresAt,
  };
};
