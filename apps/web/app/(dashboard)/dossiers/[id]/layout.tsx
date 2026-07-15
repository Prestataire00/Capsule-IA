// ARCHETYPE: command (sous-shell d'un dossier)
// Justification: hero + tabs d'un dossier, en données réelles (RLS-scopé).

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Calendar, Clock, Users as UsersIcon, Banknote } from 'lucide-react';
import { supabaseServer } from '@/shared/lib/supabase/server';
import { TabsNav } from '@/shared/components/layout/tabs-nav';
import { DossierStatusControl } from './dossier-status-control.client';
import type { DossierStatus } from '@/features/dossier/domain/value-objects/dossier-status';

const fmtDate = (iso: string | null) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(2, 4)}` : '—');
const fmtEuros = (cents: number | null) =>
  cents == null ? '—' : `${(cents / 100).toLocaleString('fr-FR', { minimumFractionDigits: 0 })} €`;
const modalityLabel = (m: string) =>
  (({ presentiel: 'Présentiel', distanciel: 'Distanciel', hybride: 'Hybride' }) as Record<string, string>)[m] ?? m;

export default async function DossierLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { id: string };
}) {
  const sb = supabaseServer();
  const { data } = await sb
    .schema('app')
    .from('dossiers')
    .select(
      'reference, status, modality, start_date, end_date, total_hours, total_amount_cents, ' +
        'learner:learners(first_name, last_name), company:companies(name), formation:formations(title)',
    )
    .eq('id', params.id)
    .maybeSingle();
  if (!data) notFound();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const d = data as any;
  const learner = [d.learner?.first_name, d.learner?.last_name].filter(Boolean).join(' ') || '—';

  return (
    <div className="min-h-[calc(100vh-3rem)]">
      <div className="max-w-6xl w-full mx-auto px-8 py-8">
        <Link
          href="/dossiers"
          className="text-[13px] text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 inline-flex items-center gap-1.5 transition mb-6"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Tous les dossiers
        </Link>

        <header className="flex items-start justify-between gap-4 mb-8">
          <div className="min-w-0">
            <div className="flex items-center gap-3 mb-2">
              <h1 className="text-2xl font-medium font-mono text-zinc-900 dark:text-zinc-100">{d.reference}</h1>
              <DossierStatusControl dossierId={params.id} status={d.status as DossierStatus} />
            </div>
            <p className="text-[15px] text-zinc-700 dark:text-zinc-300">
              {learner}
              {d.company?.name && <span className="text-zinc-500 dark:text-zinc-400">{' · '}{d.company.name}</span>}
            </p>
            <p className="text-[13px] text-zinc-500 dark:text-zinc-400 mt-0.5">{d.formation?.title ?? '—'}</p>
          </div>
        </header>

        <section className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
          <MiniStat icon={Calendar} label="Période" value={`${fmtDate(d.start_date)} → ${fmtDate(d.end_date)}`} />
          <MiniStat icon={Clock} label="Heures totales" value={`${Number(d.total_hours ?? 0)} h`} />
          <MiniStat icon={UsersIcon} label="Modalité" value={modalityLabel(d.modality)} />
          <MiniStat icon={Banknote} label="Montant" value={fmtEuros(d.total_amount_cents)} />
        </section>

        <TabsNav baseHref={`/dossiers/${params.id}`} />

        <div className="mt-8">{children}</div>
      </div>
    </div>
  );
}

function MiniStat({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div className="bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-lg px-4 py-3">
      <div className="flex items-center gap-2 mb-1">
        <Icon className="w-3.5 h-3.5 text-zinc-400 dark:text-zinc-500" />
        <p className="text-[11px] tracking-wider uppercase text-zinc-500 dark:text-zinc-400">{label}</p>
      </div>
      <p className="text-[15px] font-medium text-zinc-900 dark:text-zinc-100">{value}</p>
    </div>
  );
}
