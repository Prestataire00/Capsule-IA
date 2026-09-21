import 'server-only';
import { SignJWT, jwtVerify } from 'jose';
import { randomUUID } from 'node:crypto';
import { env } from '@/env.mjs';
import { ok, err, type Result } from '@/shared/lib/result';

/**
 * Lien de fiche besoin adressé au client d'une DEMANDE, avant tout dossier.
 *
 * Le jeton de questionnaire existant exige un `dossierId` et une assignation :
 * il ne peut donc rien servir tant que la demande n'est pas convertie. Or c'est
 * précisément à ce moment-là qu'on veut interroger le client — la réponse sert
 * ensuite à décider de la formation et à monter le dossier.
 *
 * Audience distincte (`fiche-besoin-demande`) : un jeton d'espace apprenant ou
 * de signature ne doit jamais ouvrir ce formulaire, et réciproquement.
 */

const ISSUER = 'i-a-infinity-of';
const AUDIENCE = 'fiche-besoin-demande';
// 60 jours : une demande vit le temps d'une négociation, rarement plus.
const TTL_SECONDS = 60 * 24 * 60 * 60;

const signingKey = (): Uint8Array => {
  try {
    return Uint8Array.from(Buffer.from(env.TOKEN_SIGNING_KEY, 'base64'));
  } catch {
    return new TextEncoder().encode(env.TOKEN_SIGNING_KEY);
  }
};

export type FicheBesoinPayload = {
  readonly prospectId: string;
  readonly organizationId: string;
};

export type FicheBesoinTokenError = 'invalid_token' | 'expired_token' | 'invalid_payload';

export async function generateFicheBesoinToken(payload: FicheBesoinPayload): Promise<string> {
  return new SignJWT({ org: payload.organizationId })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject(payload.prospectId)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + TTL_SECONDS)
    .setJti(randomUUID())
    .sign(signingKey());
}

export async function generateFicheBesoinUrl(payload: FicheBesoinPayload, baseUrl: string): Promise<string> {
  const token = await generateFicheBesoinToken(payload);
  return `${baseUrl.replace(/\/$/, '')}/questionnaire/besoin-demande/${token}`;
}

export async function verifyFicheBesoinToken(
  token: string,
): Promise<Result<FicheBesoinPayload, FicheBesoinTokenError>> {
  try {
    const { payload } = await jwtVerify(token, signingKey(), {
      issuer: ISSUER,
      audience: AUDIENCE,
      algorithms: ['HS256'],
    });
    if (typeof payload.sub !== 'string' || typeof payload.org !== 'string') {
      return err('invalid_payload');
    }
    return ok({ prospectId: payload.sub, organizationId: payload.org });
  } catch (e) {
    const code = (e as { code?: string }).code;
    return err(code === 'ERR_JWT_EXPIRED' ? 'expired_token' : 'invalid_token');
  }
}
