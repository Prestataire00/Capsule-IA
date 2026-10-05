// ARCHETYPE: command
import Link from 'next/link';
import { ArrowLeft, CalendarDays, Building2 } from 'lucide-react';
import { redirect } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import { env } from '@/env.mjs';
import { supabaseServer } from '@/shared/lib/supabase/server';
import { SectionLabel } from '@/shared/ui/section-label';
import { getCurrentMember } from '@/shared/lib/auth/current-member';
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

  const me = await getCurrentMember();
  const direction = me?.role === 'owner' || me?.role === 'admin';
  const { data: agendaOrganisme } = me
    ? await admin
        .schema('app')
        .from('organization_google_calendar')
        .select('account_email, last_test_status, last_test_error')
        .eq('organization_id', me.organizationId)
        .maybeSingle()
    : { data: null };
  const o = agendaOrganisme as {
    account_email: string | null;
    last_test_status: 'success' | 'error' | null;
    last_test_error: string | null;
  } | null;
  const statusOrganisme: GoogleStatus = o
    ? { configured: true, accountEmail: o.account_email, lastTestStatus: o.last_test_status, lastTestError: o.last_test_error }
    : { configured: false, accountEmail: null, lastTestStatus: null, lastTestError: null };

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
        className="inline-flex items-center gap-1.5 text-[12px] font-medium text-zinc-500 dark:text-zinc-400 hover:text-orange-600 dark:hover:text-orange-400 transition"
      >
        <ArrowLeft className="w-3 h-3" /> Retour aux intégrations
      </Link>

      <div className="flex items-center gap-2 mb-1">
        <span className="w-9 h-9 rounded-xl grid place-items-center text-white bg-emerald-500 shadow-md shadow-emerald-500/30 shrink-0">
          <CalendarDays className="w-4 h-4" />
        </span>
        <SectionLabel>Google Agenda / Meet</SectionLabel>
      </div>
      {searchParams.error && (
        <p className="text-[12px] text-red-600 dark:text-red-400">
          {searchParams.error === 'reserve_direction'
            ? 'Seuls le propriétaire et les administrateurs connectent la boîte formateur.'
            : `Échec de la connexion Google (${searchParams.error}). Réessayez.`}
        </p>
      )}

      <section className="bg-white dark:bg-zinc-900 border border-zinc-200/70 dark:border-zinc-800 rounded-xl shadow-sm p-5 space-y-3">
        <div className="flex items-center gap-2">
          <span className="w-8 h-8 rounded-lg grid place-items-center shrink-0 bg-orange-100 text-orange-700 dark:bg-orange-950/60 dark:text-orange-300">
            <Building2 className="w-4 h-4" />
          </span>
          <h2 className="text-[15px] font-medium text-zinc-900 dark:text-zinc-100">Boîte formateur de l&apos;organisme</h2>
        </div>
        <p className="text-[12px] text-zinc-500 dark:text-zinc-400">
          Connectez l&apos;adresse formateur générique : chaque séance distancielle ou hybride crée alors son Meet sur
          cet agenda et invite automatiquement les stagiaires et le formateur. Les outils d&apos;enregistrement reliés à
          cette boîte (tl;dv, Lexi) rejoignent ainsi toutes les visios. Sans elle, l&apos;agenda de la personne qui
          planifie sert.
        {' '}
          Les e-mails (lien de la visio, rappels) partent, eux, de l&apos;adresse de contact de l&apos;organisme, réglée dans{' '}
          <Link href="/parametres/organisation" className="text-orange-600 dark:text-orange-400 hover:underline">
            Paramètres → Organisation
          </Link>
          .
        </p>
        {direction ? (
          <GoogleCalendarForm initialStatus={statusOrganisme} error={null} cible="organisme" />
        ) : (
          <p className="text-[12px] text-zinc-600 dark:text-zinc-300">
            {statusOrganisme.configured
              ? `Connectée : ${statusOrganisme.accountEmail ?? '—'}.`
              : 'Pas encore connectée. La direction s’en charge.'}
          </p>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-[15px] font-medium text-zinc-900 dark:text-zinc-100">Votre agenda</h2>
        <p className="text-[12px] text-zinc-500 dark:text-zinc-400">
          Connectez <strong>votre</strong> Google Agenda pour voir vos rendez-vous dans Capsule IA
          {statusOrganisme.configured ? '.' : ', et pour créer les Meet des séances que vous planifiez tant que la boîte formateur n’est pas connectée.'}{' '}
          Le jeton est chiffré AES-256-GCM côté serveur.
        </p>
        <GoogleCalendarForm initialStatus={status} error={null} principal={!direction} />
      </section>
    </div>
  );
}
