import 'server-only';
import { SignJWT, jwtVerify } from 'jose';
import { randomUUID } from 'node:crypto';
import { env } from '@/env.mjs';
import { ok, err, type Result } from '@/shared/lib/result';
import { supabaseAdmin } from '@/shared/lib/supabase/admin';

/**
 * Lien personnel du référent d'un client vers son espace entreprise (0207).
 *
 * Il vaut pour le contact, pas pour un dossier : le référent retrouve tous
 * les dossiers dont il est référent. Le couper pose une date sur le contact ;
 * tout lien émis avant est refusé, sans changer la clé de signature.
 */

const ISSUER = 'i-a-infinity-of';
const AUDIENCE = 'entreprise';
const TTL_SECONDS = 365 * 24 * 60 * 60;

const signingKey = (): Uint8Array => {
  try {
    return Uint8Array.from(Buffer.from(env.TOKEN_SIGNING_KEY, 'base64'));
  } catch {
    return new TextEncoder().encode(env.TOKEN_SIGNING_KEY);
  }
};

export type EntreprisePayload = { readonly contactId: string; readonly organizationId: string };

export type EntrepriseTokenError = 'invalid_token' | 'expired_token' | 'revoked_token';

export async function generateEntrepriseUrl(
  payload: EntreprisePayload,
  baseUrl: string,
): Promise<{ url: string; expiresAt: Date }> {
  const expiresAt = new Date(Date.now() + TTL_SECONDS * 1000);
  const token = await new SignJWT({ sub: payload.contactId, org: payload.organizationId })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(Math.floor(expiresAt.getTime() / 1000))
    .setJti(randomUUID())
    .sign(signingKey());
  return { url: `${baseUrl.replace(/\/$/, '')}/espace-entreprise/${token}`, expiresAt };
}

export async function verifyEntrepriseToken(token: string): Promise<Result<EntreprisePayload, EntrepriseTokenError>> {
  let contactId: string;
  let organizationId: string;
  let emisLe: number;
  try {
    const { payload } = await jwtVerify(token, signingKey(), { issuer: ISSUER, audience: AUDIENCE, algorithms: ['HS256'] });
    if (typeof payload.sub !== 'string' || typeof payload.org !== 'string' || typeof payload.iat !== 'number') {
      return err('invalid_token');
    }
    contactId = payload.sub;
    organizationId = payload.org;
    emisLe = payload.iat;
  } catch (e) {
    return err((e as { code?: string })?.code === 'ERR_JWT_EXPIRED' ? 'expired_token' : 'invalid_token');
  }

  const { data, error } = await supabaseAdmin()
    .schema('app')
    .from('contacts')
    .select('organization_id, deleted_at, espace_revoked_at')
    .eq('id', contactId)
    .maybeSingle();
  if (error) throw new Error(`[espace entreprise] contact illisible : ${error.message}`);
  const c = data as { organization_id: string; deleted_at: string | null; espace_revoked_at: string | null } | null;
  if (!c || c.organization_id !== organizationId || c.deleted_at) return err('revoked_token');
  // `iat` est à la seconde : un lien émis dans la seconde de la coupure (le
  // nouveau lien envoyé juste après) reste valable.
  if (c.espace_revoked_at && (emisLe + 1) * 1000 <= new Date(c.espace_revoked_at).getTime()) return err('revoked_token');
  return ok({ contactId, organizationId });
}
