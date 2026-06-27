// ARCHETYPE: command
import Link from 'next/link';
import { ArrowLeft, CalendarDays } from 'lucide-react';
import { redirect } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import { env } from '@/env.mjs';
import { supabaseServer } from '@/shared/lib/supabase/server';
import { SectionLabel } from '@/shared/ui/section-label';
import { loadGoogleCreds } from '@/shared/lib/integrations/google-calendar-store';
import { GoogleCalendarForm, type GoogleStatus } from './google-form.client';

export const dynamic = 'force-dynamic';

export default async function GoogleCalendarIntegrationPage({
  searchParams,
}: {
  searchParams: { error?: string; connected?: string };
}) {
  const sb = supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect('/login');

  const { data: member } = await sb
    .schema('app')
    .from('members')
    .select('organization_id, role')
    .eq('user_id', user.id)
    .maybeSingle();
  if (!member) redirect('/parametres');
  const role = (member as { role: string }).role;
  if (role !== 'owner' && role !== 'admin') {
    return (
      <p className="text-[13px] text-zinc-500 dark:text-zinc-400">
        Accès réservé aux administrateurs de l&apos;organisation.
      </p>
    );
  }
  const organizationId = (member as { organization_id: string }).organization_id;

  const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: integ } = await admin
    .schema('app')
    .from('tenant_integrations')
    .select('last_test_status, last_test_error')
    .eq('organization_id', organizationId)
    .eq('kind', 'google_calendar')
    .maybeSingle();
  const creds = integ ? await loadGoogleCreds(admin, organizationId) : null;

  const status: GoogleStatus = integ
    ? {
        configured: true,
        accountEmail: creds?.accountEmail ?? null,
        lastTestStatus: (integ as { last_test_status: 'success' | 'error' | null }).last_test_status,
        lastTestError: (integ as { last_test_error: string | null }).last_test_error,
      }
    : { configured: false, accountEmail: null, lastTestStatus: null, lastTestError: null };

  return (
    <div className="space-y-6">
      <Link
        href="/parametres/integrations"
        className="inline-flex items-center gap-1.5 text-[11px] text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 transition"
      >
        <ArrowLeft className="w-3 h-3" /> Retour aux intégrations
      </Link>

      <div className="flex items-center gap-2 mb-1">
        <CalendarDays className="w-3.5 h-3.5 text-violet-500" />
        <SectionLabel>Google Agenda / Meet</SectionLabel>
      </div>
      <p className="text-[12px] text-zinc-500 dark:text-zinc-400 -mt-2">
        Crée automatiquement un lien Google Meet pour les sessions distancielles et invite les apprenants.
        Le jeton d&apos;accès est chiffré AES-256-GCM côté serveur.
      </p>

      <GoogleCalendarForm initialStatus={status} error={searchParams.error ?? null} />
    </div>
  );
}
