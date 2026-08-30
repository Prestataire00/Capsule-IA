import 'server-only';
import { SignJWT, jwtVerify } from 'jose';
import { randomUUID } from 'node:crypto';
import { env } from '@/env.mjs';
import { ok, err, type Result } from '@/shared/lib/result';

// Token de signature d'un document (lien public envoyé par email).
const ISSUER = 'i-a-infinity-of';
const AUDIENCE = 'document-signature';
const TTL_SECONDS = 30 * 24 * 60 * 60; // 30 jours

const signingKey = (): Uint8Array => {
  try {
    return Uint8Array.from(Buffer.from(env.TOKEN_SIGNING_KEY, 'base64'));
  } catch {
    return new TextEncoder().encode(env.TOKEN_SIGNING_KEY);
  }
};

export type DocumentSignaturePayload = {
  readonly signatureId: string;
  readonly documentId: string;
  readonly organizationId: string;
};

export type DocumentSignedToken = {
  readonly token: string;
  readonly jti: string;
  readonly expiresAt: Date;
};

export type DocumentSignatureTokenError = 'invalid_token' | 'expired_token' | 'invalid_payload';

export const generateDocumentSignatureToken = async (
  payload: DocumentSignaturePayload,
): Promise<DocumentSignedToken> => {
  const jti = randomUUID();
  const expiresAt = new Date(Date.now() + TTL_SECONDS * 1000);
  const token = await new SignJWT({
    sig: payload.signatureId,
    doc: payload.documentId,
    org: payload.organizationId,
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

export const verifyDocumentSignatureToken = async (
  token: string,
): Promise<Result<DocumentSignaturePayload & { jti: string }, DocumentSignatureTokenError>> => {
  try {
    const { payload } = await jwtVerify(token, signingKey(), {
      issuer: ISSUER,
      audience: AUDIENCE,
      algorithms: ['HS256'],
    });
    if (
      typeof payload.sig !== 'string' ||
      typeof payload.doc !== 'string' ||
      typeof payload.org !== 'string' ||
      typeof payload.jti !== 'string'
    ) {
      return err('invalid_payload');
    }
    // Révocation par dossier (audit CAP-14). Ce jeton ne porte pas de dossier :
    // on le retrouve via le document signé, en une lecture. Le contrôle vit ici
    // plutôt que dans les pages pour couvrir aussi l'action de signature.
    {
      const { supabaseAdmin } = await import('@/shared/lib/supabase/admin');
      const { isLinkRevoked } = await import('@/shared/lib/link-revocation');
      const { data: doc } = await supabaseAdmin()
        .schema('app')
        .from('documents')
        .select('dossier_id')
        .eq('id', payload.doc)
        .maybeSingle();
      if (await isLinkRevoked((doc?.dossier_id as string | null) ?? null, payload.iat)) {
        return err('revoked_token');
      }
    }

    return ok({
      signatureId: payload.sig,
      documentId: payload.doc,
      organizationId: payload.org,
      jti: payload.jti,
    });
  } catch (e) {
    const code = (e as { code?: string })?.code;
    if (code === 'ERR_JWT_EXPIRED') return err('expired_token');
    return err('invalid_token');
  }
};
