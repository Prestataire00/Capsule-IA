// ARCHETYPE: command
import Link from 'next/link';
import { Plus, Inbox, CheckCircle2, Clock, AlertCircle, Archive } from 'lucide-react';
import type { ComponentType } from 'react';
import { format, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';
import { createClient } from '@supabase/supabase-js';
import { env } from '@/env.mjs';
import { SectionLabel } from '@/shared/ui/section-label';
import { IdPill } from '@/shared/ui/id-pill';
import { StatusPill } from '@/shared/ui/status-pill';
import { notFound } from 'next/navigation';
import { requireAccess } from '@/shared/lib/auth/require-access';
import { getCurrentMember } from '@/shared/lib/auth/current-member';

export const dynamic = 'force-dynamic';

type ComplaintRow = {
  id: string;
  reference: string;
  subject: string;
  status: 'open' | 'in_progress' | 'resolved' | 'closed';
  severity: 'low' | 'medium' | 'high' | 'critical';
  reporter_name: string | null;
  reporter_email: string | null;
  created_at: string;
  metadata: Record<string, unknown>;
};

const admin = () =>
  createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

const sevTone = { low: 'success', medium: 'warning', high: 'danger', critical: 'danger' } as const;
const sevLabel = { low: 'mineure', medium: 'moyenne', high: 'élevée', critical: 'critique' };
const stateLabel = { open: 'ouverte', in_progress: 'en cours', resolved: 'résolue', closed: 'clôturée' };

// Visuel par statut : fond de ligne, ton de la pastille, icône — pour repérer
// d'un coup d'œil (résolue = ligne verte + ✓).
type StatusVis = {
  row: string;
  pill: 'success' | 'warning' | 'danger' | 'neutral';
  icon: ComponentType<{ className?: string }>;
  iconCls: string;
};
const STATUS_VIS: Record<ComplaintRow['status'], StatusVis> = {
  open: {
    row: 'bg-rose-50/50 dark:bg-rose-950/15 hover:bg-rose-50 dark:hover:bg-rose-950/25',
    pill: 'danger',
    icon: AlertCircle,
    iconCls: 'text-rose-500 dark:text-rose-400',
  },
  in_progress: {
    row: 'bg-amber-50/50 dark:bg-amber-950/15 hover:bg-amber-50 dark:hover:bg-amber-950/25',
    pill: 'warning',
    icon: Clock,
    iconCls: 'text-amber-500 dark:text-amber-400',
  },
  resolved: {
    row: 'bg-emerald-50/70 dark:bg-emerald-950/20 hover:bg-emerald-50 dark:hover:bg-emerald-950/30',
    pill: 'success',
    icon: CheckCircle2,
    iconCls: 'text-emerald-600 dark:text-emerald-400',
  },
  closed: {
    row: 'bg-zinc-50 dark:bg-zinc-900/50 hover:bg-zinc-100 dark:hover:bg-zinc-900',
    pill: 'neutral',
    icon: Archive,
    iconCls: 'text-zinc-400 dark:text-zinc-500',
  },
};

export default async function ReclamationsPage() {
  await requireAccess('qualiopi');
  const me = await getCurrentMember();
  if (!me) notFound();

  const sb = admin();
  const { data } = await sb
    .schema('app')
    .from('complaints')
    .select('id, reference, subject, status, severity, reporter_name, reporter_email, created_at, metadata')
    // Client service_role : sans ce filtre, la page listait les réclamations de
    // TOUS les organismes, noms et e-mails des réclamants compris.
    .eq('organization_id', me.organizationId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(200);

  const complaints = (data ?? []) as unknown as ComplaintRow[];
  const open = complaints.filter((c) => c.status === 'open' || c.status === 'in_progress');

  return (
    <div className="max-w-6xl w-full mx-auto px-6 py-8">
      <header className="flex items-end justify-between mb-6 flex-wrap gap-3">
        <div>
          <SectionLabel className="mb-1">Qualité</SectionLabel>
          <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100 tracking-tight">Réclamations</h1>
          <p className="text-[13px] text-zinc-500 dark:text-zinc-400 mt-1">
            {open.length} ouverte{open.length > 1 ? 's' : ''} · {complaints.length} au total · indicateur Qualiopi I31
          </p>
        </div>
        <Link
          href="/reclamations/nouvelle"
          className="bg-violet-600 hover:bg-violet-700 text-white text-[13px] font-medium px-4 py-2 rounded-md transition shadow-sm inline-flex items-center gap-2"
        >
          <Plus className="w-3.5 h-3.5" />
          Saisie manuelle
        </Link>
      </header>

      {complaints.length === 0 ? (
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-2xl p-12 text-center shadow-sm">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-gradient-to-br from-zinc-100 to-zinc-50 dark:from-zinc-800 dark:to-zinc-900 flex items-center justify-center mb-4">
            <Inbox className="w-6 h-6 text-zinc-400" />
          </div>
          <p className="text-[14px] font-medium text-zinc-900 dark:text-zinc-100">Pas de réclamation enregistrée</p>
          <p className="text-[13px] text-zinc-500 dark:text-zinc-400 mt-1">
            Les réclamations soumises depuis l&apos;espace apprenant apparaîtront ici.
          </p>
        </div>
      ) : (
        <ul className="border-y border-zinc-200/60 dark:border-zinc-800 divide-y divide-zinc-200/60 dark:divide-zinc-800">
          {complaints.map((c) => {
            const vis = STATUS_VIS[c.status];
            const StatusIcon = vis.icon;
            const border =
              c.status === 'resolved'
                ? 'border-emerald-400 dark:border-emerald-500'
                : c.status === 'open'
                  ? 'border-rose-400 dark:border-rose-500'
                  : c.status === 'in_progress'
                    ? 'border-amber-400 dark:border-amber-500'
                    : 'border-zinc-300 dark:border-zinc-700';
            return (
              <li key={c.id}>
                <Link
                  href={`/reclamations/${c.id}`}
                  className={`grid grid-cols-[130px_1fr_140px_120px_110px_130px] gap-3 py-3 pl-2 pr-1 items-center text-[13px] border-l-2 transition ${vis.row} ${border}`}
                >
                  <IdPill>{c.reference}</IdPill>
                  <span className="text-zinc-900 dark:text-zinc-100 truncate">{c.subject}</span>
                  <span className="text-zinc-500 dark:text-zinc-400 truncate text-[12px]">
                    {c.reporter_name ?? <span className="text-zinc-400">anonyme</span>}
                  </span>
                  <span className="tabular-nums text-[11px] text-zinc-500">
                    {format(parseISO(c.created_at), 'dd MMM yyyy', { locale: fr })}
                  </span>
                  <StatusPill tone={sevTone[c.severity]}>{sevLabel[c.severity]}</StatusPill>
                  <span className="inline-flex items-center gap-1.5 min-w-0">
                    <StatusIcon className={`w-3.5 h-3.5 flex-shrink-0 ${vis.iconCls}`} />
                    <StatusPill tone={vis.pill}>{stateLabel[c.status]}</StatusPill>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
