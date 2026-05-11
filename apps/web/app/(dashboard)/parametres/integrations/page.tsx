// ARCHETYPE: command
import { Plug, Mail, Video, CreditCard, ArrowUpRight } from 'lucide-react';
import { SectionLabel } from '@/shared/ui/section-label';

type IntegrationStatus = 'configured' | 'todo' | 'planned';

type Integration = {
  key: string;
  name: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  status: IntegrationStatus;
  badge?: string;
  docsUrl: string;
};

const INTEGRATIONS: Integration[] = [
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
    description: 'Création automatique des liens de visio pour les sessions distancielles.',
    icon: Video,
    status: 'todo',
    docsUrl: 'https://marketplace.zoom.us',
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

const STATUS_STYLES: Record<IntegrationStatus, { bg: string; text: string; label: string }> = {
  configured: { bg: 'bg-emerald-50 dark:bg-emerald-950/40', text: 'text-emerald-700 dark:text-emerald-300', label: 'Configurée' },
  todo: { bg: 'bg-amber-50 dark:bg-amber-950/40', text: 'text-amber-700 dark:text-amber-300', label: 'À configurer' },
  planned: { bg: 'bg-zinc-100 dark:bg-zinc-800', text: 'text-zinc-600 dark:text-zinc-400', label: 'Prévue' },
};

export default function ParametresIntegrationsPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 mb-1">
        <Plug className="w-3.5 h-3.5 text-violet-500" />
        <SectionLabel>Services connectés</SectionLabel>
      </div>

      <ul className="space-y-3">
        {INTEGRATIONS.map((integ) => {
          const Icon = integ.icon;
          const st = STATUS_STYLES[integ.status];
          return (
            <li
              key={integ.key}
              className="bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-xl p-5 shadow-sm flex items-start gap-4"
            >
              <span className="w-11 h-11 rounded-xl bg-violet-100 dark:bg-violet-950/40 text-violet-700 dark:text-violet-300 flex items-center justify-center flex-shrink-0 shadow-sm">
                <Icon className="w-5 h-5" />
              </span>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <p className="text-[14px] font-semibold text-zinc-900 dark:text-zinc-100">{integ.name}</p>
                  <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${st.bg} ${st.text}`}>
                    {st.label}
                  </span>
                  {integ.badge && (
                    <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400">
                      {integ.badge}
                    </span>
                  )}
                </div>
                <p className="text-[12px] text-zinc-500 dark:text-zinc-400">{integ.description}</p>
              </div>

              <a
                href={integ.docsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-[12px] text-zinc-500 dark:text-zinc-400 hover:text-violet-600 dark:hover:text-violet-400 transition flex-shrink-0"
              >
                Docs
                <ArrowUpRight className="w-3 h-3" />
              </a>
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
