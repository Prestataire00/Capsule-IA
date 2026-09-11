// ARCHETYPE: command
import Link from 'next/link';
import { Plug, Mail, Video, CreditCard, ArrowUpRight, Settings, CalendarDays } from 'lucide-react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { SectionLabel } from '@/shared/ui/section-label';
import { StatusPill } from '@/shared/ui/status-pill';
import { supabaseServer } from '@/shared/lib/supabase/server';

type IntegrationStatus = 'configured' | 'todo' | 'planned';

type Integration = {
  key: string;
  name: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  status: IntegrationStatus;
  badge?: string;
  docsUrl: string;
  configureUrl?: string;
};

const baseIntegrations = (zoomConfigured: boolean, googleConfigured: boolean): Integration[] => [
  {
    key: 'google_calendar',
    name: 'Google Agenda / Meet',
    description: 'Crée automatiquement le lien Google Meet des sessions distancielles et invite les apprenants.',
    icon: CalendarDays,
    status: googleConfigured ? 'configured' : 'todo',
    docsUrl: 'https://console.cloud.google.com/apis/credentials',
    configureUrl: '/parametres/integrations/google-calendar',
  },
  {
    key: 'resend',
    name: 'Resend',
    description: 'Envoi emails transactionnels (confirmations, notifications, relances).',
    icon: Mail,
    status: 'todo',
    docsUrl: 'https://resend.com',
  },
  {
    key: 'zoom',
    name: 'Zoom',
    description: 'Synchronisation automatique de la présence Zoom (sessions distancielles).',
    icon: Video,
    status: zoomConfigured ? 'configured' : 'todo',
    docsUrl: 'https://marketplace.zoom.us/develop/create',
    configureUrl: '/parametres/integrations/zoom',
  },
  {
    key: 'stripe',
    name: 'Stripe',
    description: 'Paiement en ligne pour les apprenants en autofinancement.',
    icon: CreditCard,
    status: 'planned',
    badge: 'V1.5',
    docsUrl: 'https://stripe.com',
  },
];

async function loadZoomConfigured(): Promise<boolean> {
  const sb = supabaseServer();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return false;
  const { data: member } = await sb
    .schema('app')
    .from('members')
    .select('organization_id')
    .eq('user_id', user.id)
    .maybeSingle();
  if (!member) return false;
  const { data: integ } = await sb
    .schema('app')
    .from('tenant_integrations')
    .select('status')
    .eq('organization_id', (member as { organization_id: string }).organization_id)
    .eq('kind', 'zoom_s2s')
    .maybeSingle();
  return Boolean(integ && (integ as { status: string }).status === 'active');
}

async function loadGoogleConfigured(): Promise<boolean> {
  const sb = supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return false;
  // Par utilisateur : la connexion Google de l'utilisateur courant.
  // (table user_integrations absente des types générés → client non typé)
  const { data: integ } = await (sb as unknown as SupabaseClient)
    .schema('app')
    .from('user_integrations')
    .select('status')
    .eq('user_id', user.id)
    .eq('kind', 'google_calendar')
    .maybeSingle();
  return Boolean(integ && (integ as { status: string } | null)?.status === 'active');
}

const STATUS_STYLES: Record<IntegrationStatus, { tone: 'success' | 'warning' | 'neutral'; label: string }> = {
  configured: { tone: 'success', label: 'Configurée' },
  todo: { tone: 'warning', label: 'À configurer' },
  planned: { tone: 'neutral', label: 'Prévue' },
};

export default async function ParametresIntegrationsPage() {
  const zoomConfigured = await loadZoomConfigured();
  const googleConfigured = await loadGoogleConfigured();
  const integrations = baseIntegrations(zoomConfigured, googleConfigured);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 mb-1">
        <Plug className="w-3.5 h-3.5 text-zinc-400" />
        <SectionLabel>Services connectés</SectionLabel>
      </div>

      <ul className="space-y-3">
        {integrations.map((integ) => {
          const Icon = integ.icon;
          const st = STATUS_STYLES[integ.status];
          return (
            <li
              key={integ.key}
              className="bg-white dark:bg-zinc-900 border border-zinc-200/70 dark:border-zinc-800 rounded-xl p-5 shadow-sm flex items-start gap-4"
            >
              <Icon className="w-5 h-5 mt-0.5 flex-shrink-0 text-zinc-400" />

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <p className="text-[14px] font-bold text-zinc-900 dark:text-zinc-100">{integ.name}</p>
                  <StatusPill tone={st.tone}>{st.label}</StatusPill>
                  {integ.badge && (
                    <span className="text-[11px] font-semibold h-6 inline-flex items-center px-2 rounded-md bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400">
                      {integ.badge}
                    </span>
                  )}
                </div>
                <p className="text-[12px] text-zinc-500 dark:text-zinc-400">{integ.description}</p>
              </div>

              <div className="flex items-center gap-3 flex-shrink-0">
                {integ.configureUrl && (
                  <Link
                    href={integ.configureUrl}
                    className="inline-flex items-center gap-1 h-8 px-2.5 rounded-lg text-[12px] font-semibold text-orange-600 dark:text-orange-400 hover:bg-orange-50 dark:hover:bg-orange-950/40 transition"
                  >
                    <Settings className="w-3 h-3" />
                    Configurer
                  </Link>
                )}
                <a
                  href={integ.docsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-[12px] font-medium text-zinc-500 dark:text-zinc-400 hover:text-orange-600 dark:hover:text-orange-400 transition"
                >
                  Docs
                  <ArrowUpRight className="w-3 h-3" />
                </a>
              </div>
            </li>
          );
        })}
      </ul>

      <p className="text-[11px] text-zinc-400 dark:text-zinc-500 pt-2">
        Une intégration manquante ? Demandez-la à l'équipe ou ouvrez une issue.
      </p>
    </div>
  );
}
