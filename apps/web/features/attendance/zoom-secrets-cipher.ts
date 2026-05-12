import 'server-only';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { env } from '@/env.mjs';

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;
const AUTH_TAG_BYTES = 16;
const CURRENT_KEY_ID = 'env:zoom_secrets_v1';

export type ZoomCredentials = {
  readonly accountId: string;
  readonly clientId: string;
  readonly clientSecret: string;
};

export type EncryptedConfig = {
  readonly ciphertextWithTag: Buffer;
  readonly iv: Buffer;
  readonly keyId: string;
};

const loadKey = (): Buffer => {
  const raw = env.ZOOM_SECRETS_KEY;
  if (!raw) throw new Error('zoom_secrets_key_missing');
  // Accepte base64 ou hex. base64 prioritaire si 44 chars (32 bytes b64).
  if (raw.length === 44) {
    const buf = Buffer.from(raw, 'base64');
    if (buf.length === 32) return buf;
  }
  if (raw.length === 64) {
    const buf = Buffer.from(raw, 'hex');
    if (buf.length === 32) return buf;
  }
  throw new Error('zoom_secrets_key_invalid_length_or_format');
};

export const encryptZoomCredentials = (creds: ZoomCredentials): EncryptedConfig => {
  const key = loadKey();
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const plaintext = Buffer.from(JSON.stringify(creds), 'utf8');
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return {
    ciphertextWithTag: Buffer.concat([ciphertext, authTag]),
    iv,
    keyId: CURRENT_KEY_ID,
  };
};

export const decryptZoomCredentials = (input: {
  ciphertextWithTag: Buffer;
  iv: Buffer;
  keyId?: string | null;
}): ZoomCredentials => {
  if (input.ciphertextWithTag.length <= AUTH_TAG_BYTES) {
    throw new Error('zoom_ciphertext_too_short');
  }
  const key = loadKey();
  const ciphertext = input.ciphertextWithTag.subarray(0, input.ciphertextWithTag.length - AUTH_TAG_BYTES);
  const authTag = input.ciphertextWithTag.subarray(input.ciphertextWithTag.length - AUTH_TAG_BYTES);
  const decipher = createDecipheriv(ALGORITHM, key, input.iv);
  decipher.setAuthTag(authTag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return JSON.parse(plaintext.toString('utf8')) as ZoomCredentials;
};
