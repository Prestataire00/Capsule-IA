// ARCHETYPE: command
// Justification: vue agrégée de la conformité Qualiopi par dossier — densité, drill-down rapide.

import Link from 'next/link';
import { ShieldCheck, ShieldAlert, Download } from 'lucide-react';
import { dossiers, learnerFullName, formationTitle } from '@/shared/mock/data';
import { SectionLabel } from '@/shared/ui/section-label';
import { IdPill } from '@/shared/ui/id-pill';
import { StatCard } from '@/shared/ui/stat-card';
import { dossierStatusLabel } from '@/shared/ui/status-pill';

export default function QualiopiOrgPage() {
  const inScope = dossiers.filter((d) => ['scheduled', 'active', 'completed'].includes(d.status));
  const ready = inScope.filter((d) => d.qualiopiReady).length;
  const blocking = inScope.filter((d) => d.qualiopiBlocking > 0).length;
  const totalIndicators = inScope.reduce((acc, d) => acc + d.qualiopiTotal, 0);
  const satisfied = inScope.reduce((acc, d) => acc + d.qualiopiSatisfied, 0);

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
        <button
          type="button"
          className="border border-zinc-200/60 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 text-[13px] px-3 py-1.5 rounded-md hover:bg-zinc-50 dark:hover:bg-zinc-900 transition inline-flex items-center gap-2"
        >
          <Download className="w-3.5 h-3.5" />
          Exporter audit (ZIP)
        </button>
      </header>

      <section className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
        <StatCard label="Dossiers Qualiopi-ready" value={`${ready}/${inScope.length}`} hint={ready === inScope.length ? 'tous prêts' : '—'} />
        <StatCard label="Dossiers bloquants" value={blocking} hint={blocking > 0 ? 'à traiter' : 'aucun'} />
        <StatCard label="Indicateurs satisfaits" value={`${satisfied}`} hint={`/ ${totalIndicators}`} />
        <StatCard label="Certification" value="✓" hint="Valide jusqu'à mars 2027" />
      </section>

      <SectionLabel className="mb-3">Dossiers en cours</SectionLabel>
      <ul className="border-y border-zinc-200/60 dark:border-zinc-800 divide-y divide-zinc-200/60 dark:divide-zinc-800">
        {inScope.map((d) => (
          <li key={d.id}>
            <Link
              href={`/dossiers/${d.id}/qualiopi`}
              className="grid grid-cols-[110px_1fr_1fr_120px_120px_140px] gap-3 py-3 px-1 items-center text-[13px] hover:bg-zinc-50 dark:hover:bg-zinc-900 transition"
            >
              <IdPill>{d.reference}</IdPill>
              <span className="text-zinc-900 dark:text-zinc-100">{learnerFullName(d.learnerId)}</span>
              <span className="text-zinc-500 dark:text-zinc-400 truncate">{formationTitle(d.formationId)}</span>
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
    </div>
  );
}
