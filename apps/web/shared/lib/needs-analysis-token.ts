import 'server-only';
import { SignJWT, jwtVerify } from 'jose';
import { randomUUID } from 'node:crypto';
import { env } from '@/env.mjs';
import { ok, err, type Result } from '@/shared/lib/result';

// Token signé du lien « fiche besoin » (questionnaire de positionnement / analyse
// des besoins) envoyé à l'apprenant. Calqué sur satisfaction-token.

const ISSUER = 'i-a-infinity-of';
const AUDIENCE = 'needs-analysis';
const TTL_SECONDS = 60 * 24 * 60 * 60; // 60 jours

const signingKey = (): Uint8Array => {
  try {
    return Uint8Array.from(Buffer.from(env.TOKEN_SIGNING_KEY, 'base64'));
  } catch {
    return new TextEncoder().encode(env.TOKEN_SIGNING_KEY);
  }
};

export type NeedsAnalysisPayload = {
  readonly assignmentId: string;
  readonly dossierId: string;
  readonly organizationId: string;
  readonly learnerId: string;
};

export type NeedsAnalysisSignedToken = {
  readonly token: string;
  readonly jti: string;
  readonly expiresAt: Date;
};

export type NeedsAnalysisTokenError = 'invalid_token' | 'expired_token' | 'invalid_payload';

export const generateNeedsAnalysisToken = async (
  payload: NeedsAnalysisPayload,
): Promise<NeedsAnalysisSignedToken> => {
  const jti = randomUUID();
  const expiresAt = new Date(Date.now() + TTL_SECONDS * 1000);

  const token = await new SignJWT({
    sub: payload.learnerId,
    org: payload.organizationId,
    dos: payload.dossierId,
    asg: payload.assignmentId,
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

export const verifyNeedsAnalysisToken = async (
  token: string,
): Promise<Result<NeedsAnalysisPayload & { jti: string }, NeedsAnalysisTokenError>> => {
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
      typeof payload.asg !== 'string' ||
      typeof payload.jti !== 'string'
    ) {
      return err('invalid_payload');
    }

    return ok({
      learnerId: payload.sub,
      organizationId: payload.org,
      dossierId: payload.dos,
      assignmentId: payload.asg,
      jti: payload.jti,
    });
  } catch (e) {
    const code = (e as { code?: string })?.code;
    if (code === 'ERR_JWT_EXPIRED') return err('expired_token');
    return err('invalid_token');
  }
};

export const generateNeedsAnalysisUrl = async (
  payload: NeedsAnalysisPayload,
  baseUrl: string,
): Promise<{ url: string; token: string; expiresAt: Date }> => {
  const signed = await generateNeedsAnalysisToken(payload);
  return {
    url: `${baseUrl.replace(/\/$/, '')}/questionnaire/besoin/${signed.token}`,
    token: signed.token,
    expiresAt: signed.expiresAt,
  };
};
