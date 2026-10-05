'use server';

import { createClient } from '@supabase/supabase-js';
import { env } from '@/env.mjs';
import { supabaseServer } from '@/shared/lib/supabase/server';
import {
  loadGoogleCredsForOrganization,
  loadGoogleCredsForUser,
} from '@/shared/lib/integrations/google-calendar-store';
import { getCurrentMember } from '@/shared/lib/auth/current-member';
import { testConnection } from '@/shared/lib/integrations/google-calendar-client';

const admin = () =>
  createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

async function currentUserId(): Promise<string | null> {
  const sb = supabaseServer();
  const { data } = await sb.auth.getUser();
  return data?.user?.id ?? null;
}

export async function testGoogleCalendarFromStored(): Promise<{ ok: true } | { ok: false; error: string }> {
  const userId = await currentUserId();
  if (!userId) return { ok: false, error: 'unauthenticated' };

  const sb = admin();
  const creds = await loadGoogleCredsForUser(sb, userId);
  if (!creds) return { ok: false, error: 'not_configured' };

  const test = await testConnection(creds);
  await sb
    .schema('app')
    .from('user_integrations')
    .update({
      last_test_at: new Date().toISOString(),
      last_test_status: test.ok ? 'success' : 'error',
      last_test_error: test.ok ? null : test.error,
      status: test.ok ? 'active' : 'error',
    })
    .eq('user_id', userId)
    .eq('kind', 'google_calendar');

  return test.ok ? { ok: true } : { ok: false, error: `test_failed:${test.error}` };
}

export async function disconnectGoogleCalendar(): Promise<{ ok: true } | { ok: false; error: string }> {
  const userId = await currentUserId();
  if (!userId) return { ok: false, error: 'unauthenticated' };
  const sb = admin();
  const { error } = await sb
    .schema('app')
    .from('user_integrations')
    .delete()
    .eq('user_id', userId)
    .eq('kind', 'google_calendar');
  if (error) return { ok: false, error: `delete_failed:${error.message}` };
  return { ok: true };
}

export type CibleAgenda = 'moi' | 'organisme';

/** La boîte formateur de l'organisme se gère par la direction seule. */
async function organismeDeLaDirection(): Promise<string | null> {
  const me = await getCurrentMember();
  return me && (me.role === 'owner' || me.role === 'admin') ? me.organizationId : null;
}

export async function testOrganisationCalendar(): Promise<{ ok: true } | { ok: false; error: string }> {
  const organizationId = await organismeDeLaDirection();
  if (!organizationId) return { ok: false, error: 'Réservé à la direction.' };

  const sb = admin();
  const creds = await loadGoogleCredsForOrganization(sb, organizationId);
  if (!creds) return { ok: false, error: 'not_configured' };

  const test = await testConnection(creds);
  await sb
    .schema('app')
    .from('organization_google_calendar')
    .update({
      last_test_at: new Date().toISOString(),
      last_test_status: test.ok ? 'success' : 'error',
      last_test_error: test.ok ? null : test.error,
    })
    .eq('organization_id', organizationId);

  return test.ok ? { ok: true } : { ok: false, error: `test_failed:${test.error}` };
}

export async function disconnectOrganisationCalendar(): Promise<{ ok: true } | { ok: false; error: string }> {
  const organizationId = await organismeDeLaDirection();
  if (!organizationId) return { ok: false, error: 'Réservé à la direction.' };
  const { error } = await admin()
    .schema('app')
    .from('organization_google_calendar')
    .delete()
    .eq('organization_id', organizationId);
  if (error) return { ok: false, error: `delete_failed:${error.message}` };
  return { ok: true };
}
