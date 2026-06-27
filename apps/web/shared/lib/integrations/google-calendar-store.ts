import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { env } from '@/env.mjs';
import {
  encryptGoogleCredentials,
  decryptGoogleCredentials,
  bytesToBuffer,
  type GoogleCalendarCredentials,
} from './google-secrets-cipher';

const KIND = 'google_calendar';

export function googleRedirectUri(): string | null {
  if (!env.PUBLIC_APP_URL) return null;
  return `${env.PUBLIC_APP_URL.replace(/\/$/, '')}/api/integrations/google-calendar/callback`;
}

// État OAuth signé (anti-CSRF) : orgId.HMAC(orgId).
export function signState(organizationId: string): string {
  const mac = createHmac('sha256', env.TOKEN_SIGNING_KEY).update(organizationId).digest('base64url');
  return `${organizationId}.${mac}`;
}

export function verifyState(state: string | null): string | null {
  if (!state || !state.includes('.')) return null;
  const idx = state.lastIndexOf('.');
  const orgId = state.slice(0, idx);
  const mac = state.slice(idx + 1);
  const expected = createHmac('sha256', env.TOKEN_SIGNING_KEY).update(orgId).digest('base64url');
  try {
    if (mac.length === expected.length && timingSafeEqual(Buffer.from(mac), Buffer.from(expected))) return orgId;
  } catch {
    /* longueurs différentes */
  }
  return null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Sb = SupabaseClient<any, any, any>;

export async function saveGoogleCreds(
  sb: Sb,
  organizationId: string,
  creds: GoogleCalendarCredentials,
): Promise<{ ok: true } | { ok: false; error: string }> {
  let enc: ReturnType<typeof encryptGoogleCredentials>;
  try {
    enc = encryptGoogleCredentials(creds);
  } catch (e) {
    return { ok: false, error: `cipher_failed:${(e as Error).message}` };
  }
  const { error } = await sb
    .schema('app')
    .from('tenant_integrations')
    .upsert(
      {
        organization_id: organizationId,
        kind: KIND,
        status: 'active',
        config_encrypted: enc.ciphertextWithTag,
        config_nonce: enc.iv,
        config_key_id: enc.keyId,
        last_test_at: new Date().toISOString(),
        last_test_status: 'success',
        last_test_error: null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'organization_id,kind' },
    );
  if (error) return { ok: false, error: `persistence_failed:${error.message}` };
  return { ok: true };
}

export async function loadGoogleCreds(sb: Sb, organizationId: string): Promise<GoogleCalendarCredentials | null> {
  const { data } = await sb
    .schema('app')
    .from('tenant_integrations')
    .select('config_encrypted, config_nonce, config_key_id')
    .eq('organization_id', organizationId)
    .eq('kind', KIND)
    .maybeSingle();
  if (!data) return null;
  const row = data as { config_encrypted: unknown; config_nonce: unknown; config_key_id: string | null };
  const cipherBuf = bytesToBuffer(row.config_encrypted);
  const ivBuf = bytesToBuffer(row.config_nonce);
  if (!cipherBuf || !ivBuf) return null;
  try {
    return decryptGoogleCredentials({ ciphertextWithTag: cipherBuf, iv: ivBuf, keyId: row.config_key_id });
  } catch {
    return null;
  }
}
