import 'server-only';
import { SignJWT, jwtVerify } from 'jose';
import { randomUUID } from 'node:crypto';
import { env } from '@/env.mjs';
import { ok, err, type Result } from '@/shared/lib/result';

const ISSUER = 'i-a-infinity-of';
const AUDIENCE = 'questionnaire-funder';
const TTL_SECONDS = 60 * 24 * 60 * 60;

const signingKey = (): Uint8Array => {
  try {
    return Uint8Array.from(Buffer.from(env.TOKEN_SIGNING_KEY, 'base64'));
  } catch {
    return new TextEncoder().encode(env.TOKEN_SIGNING_KEY);
  }
};

export type QuestionnairePayload = {
  readonly assignmentId: string;
  readonly dossierId: string;
  readonly organizationId: string;
};

export type QuestionnaireSignedToken = {
  readonly token: string;
  readonly jti: string;
  readonly expiresAt: Date;
};

export type QuestionnaireTokenError =
  | 'invalid_token'
  | 'expired_token'
  | 'invalid_payload';

export const generateQuestionnaireToken = async (
  payload: QuestionnairePayload,
): Promise<QuestionnaireSignedToken> => {
  const jti = randomUUID();
  const expiresAt = new Date(Date.now() + TTL_SECONDS * 1000);

  const token = await new SignJWT({
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

export const verifyQuestionnaireToken = async (
  token: string,
): Promise<Result<QuestionnairePayload, QuestionnaireTokenError>> => {
  try {
    const { payload } = await jwtVerify(token, signingKey(), {
      issuer: ISSUER,
      audience: AUDIENCE,
      algorithms: ['HS256'],
    });

    if (
      typeof payload.org !== 'string' ||
      typeof payload.dos !== 'string' ||
      typeof payload.asg !== 'string'
    ) {
      return err('invalid_payload');
    }

    return ok({
      organizationId: payload.org,
      dossierId: payload.dos,
      assignmentId: payload.asg,
    });
  } catch (e) {
    const code = (e as { code?: string })?.code;
    if (code === 'ERR_JWT_EXPIRED') return err('expired_token');
    return err('invalid_token');
  }
};
