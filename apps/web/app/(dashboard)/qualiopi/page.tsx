// ARCHETYPE: command
// Justification: vue agrégée de la conformité Qualiopi par dossier — densité, drill-down rapide.

import Link from 'next/link';
import { ShieldCheck, ShieldAlert } from 'lucide-react';
import { supabaseServer } from '@/shared/lib/supabase/server';
import { SectionLabel } from '@/shared/ui/section-label';
import { IdPill } from '@/shared/ui/id-pill';
import { StatCard } from '@/shared/ui/stat-card';
import { dossierStatusLabel } from '@/shared/ui/status-pill';

export const dynamic = 'force-dynamic';

type QualiopiDossierRow = {
  id: string;
  reference: string;
  status: string;
  qualiopi_ready: boolean | null;
  learner: { first_name: string; last_name: string } | null;
  formation: { title: string } | null;
  checklist: {
    total_indicators: number;
    satisfied_indicators: number;
    blocking_missing: number;
  } | null;
};

type QualiopiDossier = {
  id: string;
  reference: string;
  status: string;
  learnerName: string;
  formationTitle: string;
  qualiopiReady: boolean;
  qualiopiTotal: number;
  qualiopiSatisfied: number;
  qualiopiBlocking: number;
};

const SCOPED_STATUSES = ['scheduled', 'active', 'completed'] as const;

async function loadInScopeDossiers(
  sb: ReturnType<typeof supabaseServer>,
): Promise<QualiopiDossier[]> {
  const { data, error } = await sb
    .schema('app')
    .from('dossiers')
    .select(
      `
      id, reference, status, qualiopi_ready,
      learner:learners(first_name, last_name),
      formation:formations(title),
      checklist:qualiopi_dossier_checklists(total_indicators, satisfied_indicators, blocking_missing)
    `,
    )
    .in('status', SCOPED_STATUSES)
    .order('reference', { ascending: true });

  if (error) throw error;

  return ((data ?? []) as unknown as QualiopiDossierRow[]).map((d) => ({
    id: d.id,
    reference: d.reference,
    status: d.status,
    learnerName: d.learner
      ? `${d.learner.first_name} ${d.learner.last_name}`.trim()
      : '—',
    formationTitle: d.formation?.title ?? '—',
    qualiopiReady: d.qualiopi_ready ?? false,
    qualiopiTotal: d.checklist?.total_indicators ?? 0,
    qualiopiSatisfied: d.checklist?.satisfied_indicators ?? 0,
    qualiopiBlocking: d.checklist?.blocking_missing ?? 0,
  }));
}

export default async function QualiopiOrgPage({
  searchParams,
}: {
  searchParams: { filter?: string };
}) {
  const sb = supabaseServer();
  const inScope = await loadInScopeDossiers(sb);

  const ready = inScope.filter((d) => d.qualiopiReady).length;
  const blocking = inScope.filter((d) => d.qualiopiBlocking > 0).length;
  const totalIndicators = inScope.reduce((acc, d) => acc + d.qualiopiTotal, 0);
  const satisfied = inScope.reduce((acc, d) => acc + d.qualiopiSatisfied, 0);

  const activeFilter =
    searchParams.filter === 'blocking' || searchParams.filter === 'ready' ? searchParams.filter : null;
  const dossiers =
    activeFilter === 'blocking'
      ? inScope.filter((d) => d.qualiopiBlocking > 0)
      : activeFilter === 'ready'
        ? inScope.filter((d) => d.qualiopiReady)
        : inScope;
  const filterLabels: Record<string, string> = { blocking: 'Dossiers bloquants', ready: 'Dossiers conformes' };

  return (
    <div className="max-w-6xl w-full mx-auto px-6 py-8">
      <header className="flex items-end justify-between mb-6">
        <div>
          <SectionLabel className="mb-1">Conformité</SectionLabel>
          <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100 tracking-tight">Qualiopi</h1>
          <p className="text-[13px] text-zinc-500 dark:text-zinc-400 mt-1">
            État de conformité de l'organisme et des dossiers en cours.
          </p>
        </div>
      </header>

      {/* Retirés (audit CAP-34) : une carte « Certification ✓ Valide jusqu'à mars
          2027 » écrite en dur, identique pour tous les organismes, et un bouton
          « Exporter audit (ZIP) » sans aucune action. */}
      <section className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-8">
        <StatCard label="Dossiers Qualiopi-ready" value={`${ready}/${inScope.length}`} hint={inScope.length > 0 && ready === inScope.length ? 'tous prêts' : '—'} href="/qualiopi?filter=ready" />
        <StatCard label="Dossiers bloquants" value={blocking} hint={blocking > 0 ? 'à traiter' : 'aucun'} href="/qualiopi?filter=blocking" />
        <StatCard label="Indicateurs satisfaits" value={`${satisfied}`} hint={`/ ${totalIndicators}`} />
      </section>

      <div className="flex items-center justify-between mb-3">
        <SectionLabel>Dossiers en cours</SectionLabel>
        {activeFilter && (
          <span className="flex items-center gap-2 text-[13px]">
            <span className="text-zinc-500 dark:text-zinc-400">
              Filtré sur <span className="font-medium text-zinc-700 dark:text-zinc-300">{filterLabels[activeFilter]}</span>
            </span>
            <Link href="/qualiopi" className="inline-flex items-center gap-1 text-orange-600 hover:underline">
              ✕ Tout afficher
            </Link>
          </span>
        )}
      </div>
      {dossiers.length === 0 ? (
        <p className="text-[13px] text-zinc-400 text-center py-12">
          Aucun dossier en cours à suivre.
        </p>
      ) : (
        <ul className="border-y border-zinc-200/60 dark:border-zinc-800 divide-y divide-zinc-200/60 dark:divide-zinc-800">
          {dossiers.map((d) => (
            <li key={d.id}>
              <Link
                href={`/dossiers/${d.id}/qualiopi`}
                className="grid grid-cols-[110px_1fr_1fr_120px_120px_140px] gap-3 py-3 px-1 items-center text-[13px] hover:bg-zinc-50 dark:hover:bg-zinc-900 transition"
              >
                <IdPill>{d.reference}</IdPill>
                <span className="text-zinc-900 dark:text-zinc-100">{d.learnerName}</span>
                <span className="text-zinc-500 dark:text-zinc-400 truncate">{d.formationTitle}</span>
                <span className="text-zinc-500 dark:text-zinc-400">{dossierStatusLabel(d.status)}</span>
                <span className="font-mono text-[11px] text-zinc-700 dark:text-zinc-300">
                  {d.qualiopiSatisfied}/{d.qualiopiTotal}
                </span>
                {d.qualiopiReady ? (
                  <span className="inline-flex items-center gap-1.5 text-[11px] text-emerald-600 dark:text-emerald-500">
                    <ShieldCheck className="w-3.5 h-3.5" />
                    prêt
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 text-[11px] text-amber-600 dark:text-amber-500">
                    <ShieldAlert className="w-3.5 h-3.5" />
                    {d.qualiopiBlocking} bloquant{d.qualiopiBlocking > 1 ? 's' : ''}
                  </span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
