'use server';

import { createClient } from '@supabase/supabase-js';
import { env } from '@/env.mjs';
import {
  encryptZoomCredentials,
  decryptZoomCredentials,
  type ZoomCredentials,
} from '@/features/attendance/zoom-secrets-cipher';
import { testZoomConnection as zoomApiTest } from '@/features/attendance/zoom-api-client';
import { getCurrentMember } from '@/shared/lib/auth/current-member';

const admin = () =>
  createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

type AuthContext = {
  ok: true;
  userId: string;
  organizationId: string;
  role: 'owner' | 'admin' | 'gestionnaire' | 'formateur' | 'comptable' | string;
};

const requireAdmin = async (): Promise<AuthContext | { ok: false; error: string }> => {
  // Interrogeait `app.memberships`, table inexistante (audit CAP-16) : toute
  // action Zoom échouait en « no_membership ». La table réelle est `app.members`.
  const member = await getCurrentMember();
  if (!member) return { ok: false, error: 'unauthenticated' };
  const role = member.role;
  if (role !== 'owner' && role !== 'admin') return { ok: false, error: 'forbidden' };
  return {
    ok: true,
    userId: member.userId,
    organizationId: member.organizationId,
    role,
  };
};

export type ConnectZoomS2sResult =
  | { ok: true; accountEmail: string }
  | { ok: false; error: string };

export async function connectZoomS2s(input: {
  accountId: string;
  clientId: string;
  clientSecret: string;
}): Promise<ConnectZoomS2sResult> {
  if (!env.ZOOM_SECRETS_KEY) return { ok: false, error: 'zoom_secrets_key_missing_on_server' };

  const auth = await requireAdmin();
  if (!auth.ok) return { ok: false, error: auth.error };

  const creds: ZoomCredentials = {
    accountId: input.accountId.trim(),
    clientId: input.clientId.trim(),
    clientSecret: input.clientSecret.trim(),
  };
  if (!creds.accountId || !creds.clientId || !creds.clientSecret) {
    return { ok: false, error: 'invalid_input' };
  }

  // 1. Test OAuth avant de stocker
  const test = await zoomApiTest(creds);
  if (!test.ok) {
    return { ok: false, error: `test_failed:${test.error.code}` };
  }

  // 2. Chiffrer + UPSERT
  let encrypted: ReturnType<typeof encryptZoomCredentials>;
  try {
    encrypted = encryptZoomCredentials(creds);
  } catch (e) {
    return { ok: false, error: `cipher_failed:${(e as Error).message}` };
  }

  const sb = admin();
  const { error } = await sb
    .schema('app')
    .from('tenant_integrations')
    .upsert(
      {
        organization_id: auth.organizationId,
        kind: 'zoom_s2s',
        status: 'active',
        config_encrypted: encrypted.ciphertextWithTag,
        config_nonce: encrypted.iv,
        config_key_id: encrypted.keyId,
        last_test_at: new Date().toISOString(),
        last_test_status: 'success',
        last_test_error: null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'organization_id,kind' },
    );
  if (error) return { ok: false, error: `persistence_failed:${error.message}` };

  return { ok: true, accountEmail: test.accountEmail };
}

export type TestZoomConnectionResult =
  | { ok: true; accountEmail: string }
  | { ok: false; error: string };

export async function testZoomConnectionFromStored(): Promise<TestZoomConnectionResult> {
  if (!env.ZOOM_SECRETS_KEY) return { ok: false, error: 'zoom_secrets_key_missing_on_server' };

  const auth = await requireAdmin();
  if (!auth.ok) return { ok: false, error: auth.error };

  const sb = admin();
  const { data } = await sb
    .schema('app')
    .from('tenant_integrations')
    .select('config_encrypted, config_nonce, config_key_id')
    .eq('organization_id', auth.organizationId)
    .eq('kind', 'zoom_s2s')
    .maybeSingle();
  if (!data) return { ok: false, error: 'not_configured' };

  const row = data as {
    config_encrypted: string | { type: string; data: number[] } | null;
    config_nonce: string | { type: string; data: number[] } | null;
    config_key_id: string | null;
  };

  const toBuffer = (v: unknown): Buffer | null => {
    if (!v) return null;
    if (typeof v === 'string') {
      // bytea hex `\xAABB...` ou base64
      if (v.startsWith('\\x')) return Buffer.from(v.slice(2), 'hex');
      return Buffer.from(v, 'base64');
    }
    if (typeof v === 'object' && 'data' in (v as Record<string, unknown>)) {
      return Buffer.from((v as { data: number[] }).data);
    }
    return null;
  };

  const cipherBuf = toBuffer(row.config_encrypted);
  const ivBuf = toBuffer(row.config_nonce);
  if (!cipherBuf || !ivBuf) return { ok: false, error: 'stored_format_invalid' };

  let creds: ZoomCredentials;
  try {
    creds = decryptZoomCredentials({ ciphertextWithTag: cipherBuf, iv: ivBuf, keyId: row.config_key_id });
  } catch (e) {
    return { ok: false, error: `decrypt_failed:${(e as Error).message}` };
  }

  const test = await zoomApiTest(creds);
  await sb
    .schema('app')
    .from('tenant_integrations')
    .update({
      last_test_at: new Date().toISOString(),
      last_test_status: test.ok ? 'success' : 'error',
      last_test_error: test.ok ? null : `${test.error.code}`,
    })
    .eq('organization_id', auth.organizationId)
    .eq('kind', 'zoom_s2s');

  if (!test.ok) return { ok: false, error: `test_failed:${test.error.code}` };
  return { ok: true, accountEmail: test.accountEmail };
}

export async function disconnectZoomS2s(): Promise<{ ok: true } | { ok: false; error: string }> {
  const auth = await requireAdmin();
  if (!auth.ok) return { ok: false, error: auth.error };
  const sb = admin();
  const { error } = await sb
    .schema('app')
    .from('tenant_integrations')
    .delete()
    .eq('organization_id', auth.organizationId)
    .eq('kind', 'zoom_s2s');
  if (error) return { ok: false, error: `delete_failed:${error.message}` };
  return { ok: true };
}
