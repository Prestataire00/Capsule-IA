'use server';

import { createClient } from '@supabase/supabase-js';
import { env } from '@/env.mjs';
import { supabaseServer } from '@/shared/lib/supabase/server';
import { loadGoogleCreds } from '@/shared/lib/integrations/google-calendar-store';
import { testConnection } from '@/shared/lib/integrations/google-calendar-client';

const admin = () =>
  createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

async function requireAdminOrg(): Promise<{ ok: true; organizationId: string } | { ok: false; error: string }> {
  const sb = supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return { ok: false, error: 'unauthenticated' };
  const { data: member } = await sb
    .schema('app')
    .from('members')
    .select('organization_id, role')
    .eq('user_id', user.id)
    .maybeSingle();
  const m = member as { organization_id: string; role: string } | null;
  if (!m) return { ok: false, error: 'no_membership' };
  if (m.role !== 'owner' && m.role !== 'admin') return { ok: false, error: 'forbidden' };
  return { ok: true, organizationId: m.organization_id };
}

export async function testGoogleCalendarFromStored(): Promise<{ ok: true } | { ok: false; error: string }> {
  const auth = await requireAdminOrg();
  if (!auth.ok) return { ok: false, error: auth.error };

  const sb = admin();
  const creds = await loadGoogleCreds(sb, auth.organizationId);
  if (!creds) return { ok: false, error: 'not_configured' };

  const test = await testConnection(creds);
  await sb
    .schema('app')
    .from('tenant_integrations')
    .update({
      last_test_at: new Date().toISOString(),
      last_test_status: test.ok ? 'success' : 'error',
      last_test_error: test.ok ? null : test.error,
      status: test.ok ? 'active' : 'error',
    })
    .eq('organization_id', auth.organizationId)
    .eq('kind', 'google_calendar');

  return test.ok ? { ok: true } : { ok: false, error: `test_failed:${test.error}` };
}

export async function disconnectGoogleCalendar(): Promise<{ ok: true } | { ok: false; error: string }> {
  const auth = await requireAdminOrg();
  if (!auth.ok) return { ok: false, error: auth.error };
  const sb = admin();
  const { error } = await sb
    .schema('app')
    .from('tenant_integrations')
    .delete()
    .eq('organization_id', auth.organizationId)
    .eq('kind', 'google_calendar');
  if (error) return { ok: false, error: `delete_failed:${error.message}` };
  return { ok: true };
}
