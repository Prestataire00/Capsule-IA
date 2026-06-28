import 'server-only';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { env } from '@/env.mjs';

// Chiffrement des identifiants Google (refresh token OAuth) — même schéma que
// l'intégration Zoom (AES-256-GCM, clé ZOOM_SECRETS_KEY réutilisée).

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;
const AUTH_TAG_BYTES = 16;
const CURRENT_KEY_ID = 'env:zoom_secrets_v1';

export type GoogleCalendarCredentials = {
  readonly refreshToken: string;
  readonly accountEmail: string;
  readonly calendarId: string;
};

export type EncryptedConfig = {
  readonly ciphertextWithTag: Buffer;
  readonly iv: Buffer;
  readonly keyId: string;
};

const loadKey = (): Buffer => {
  const raw = env.ZOOM_SECRETS_KEY;
  if (raw && raw.length === 44) {
    const buf = Buffer.from(raw, 'base64');
    if (buf.length === 32) return buf;
  }
  if (raw && raw.length === 64) {
    const buf = Buffer.from(raw, 'hex');
    if (buf.length === 32) return buf;
  }
  // Fallback : dérive une clé 32 octets de TOKEN_SIGNING_KEY (toujours présent, min 32 chars).
  // Évite d'exiger ZOOM_SECRETS_KEY juste pour l'intégration Google.
  return createHash('sha256').update(env.TOKEN_SIGNING_KEY).digest();
};

export const encryptGoogleCredentials = (creds: GoogleCalendarCredentials): EncryptedConfig => {
  const key = loadKey();
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const plaintext = Buffer.from(JSON.stringify(creds), 'utf8');
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return { ciphertextWithTag: Buffer.concat([ciphertext, authTag]), iv, keyId: CURRENT_KEY_ID };
};

export const decryptGoogleCredentials = (input: {
  ciphertextWithTag: Buffer;
  iv: Buffer;
  keyId?: string | null;
}): GoogleCalendarCredentials => {
  if (input.ciphertextWithTag.length <= AUTH_TAG_BYTES) throw new Error('ciphertext_too_short');
  const key = loadKey();
  const ciphertext = input.ciphertextWithTag.subarray(0, input.ciphertextWithTag.length - AUTH_TAG_BYTES);
  const authTag = input.ciphertextWithTag.subarray(input.ciphertextWithTag.length - AUTH_TAG_BYTES);
  const decipher = createDecipheriv(ALGORITHM, key, input.iv);
  decipher.setAuthTag(authTag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return JSON.parse(plaintext.toString('utf8')) as GoogleCalendarCredentials;
};

/** Conversion BYTEA Supabase (hex `\x…`, base64, ou { data:number[] }) → Buffer. */
export const bytesToBuffer = (v: unknown): Buffer | null => {
  if (!v) return null;
  if (typeof v === 'string') {
    if (v.startsWith('\\x')) return Buffer.from(v.slice(2), 'hex');
    return Buffer.from(v, 'base64');
  }
  if (typeof v === 'object' && 'data' in (v as Record<string, unknown>)) {
    return Buffer.from((v as { data: number[] }).data);
  }
  return null;
};
