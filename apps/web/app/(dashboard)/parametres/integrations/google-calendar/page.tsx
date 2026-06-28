// ARCHETYPE: command
import Link from 'next/link';
import { ArrowLeft, CalendarDays } from 'lucide-react';
import { redirect } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import { env } from '@/env.mjs';
import { supabaseServer } from '@/shared/lib/supabase/server';
import { SectionLabel } from '@/shared/ui/section-label';
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

  const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: integ } = await admin
    .schema('app')
    .from('user_integrations')
    .select('account_email, last_test_status, last_test_error')
    .eq('user_id', user.id)
    .eq('kind', 'google_calendar')
    .maybeSingle();

  const status: GoogleStatus = integ
    ? {
        configured: true,
        accountEmail: (integ as { account_email: string | null }).account_email,
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
        Connectez <strong>votre</strong> Google Agenda : les sessions distancielles que vous planifiez créeront un
        lien Meet sur votre agenda et inviteront les apprenants. Le jeton est chiffré AES-256-GCM côté serveur.
      </p>

      <GoogleCalendarForm initialStatus={status} error={searchParams.error ?? null} />
    </div>
  );
}
