// ARCHETYPE: command
// Justification: pilotage consolidé de l'émargement (risque de preuve manquante) — preuve Qualiopi indicateur 22.

import Link from 'next/link';
import { ClipboardCheck, AlertTriangle, Video, ShieldCheck } from 'lucide-react';
import { StatCard } from '@/shared/ui/stat-card';
import { ProgressBar } from '@/shared/ui/progress-bar';
import {
  listConsolidatedAttendance,
  type ConsolidatedFilters,
} from '@/features/attendance/queries/list-consolidated-attendance';
import type { Lens } from '@/features/attendance/queries/attendance-consolidated.types';
import { LensToggle } from './lens-toggle';
import { requireAccess } from '@/shared/lib/auth/require-access';

export const dynamic = 'force-dynamic';

const LENSES: ReadonlyArray<Lens> = ['session', 'company', 'trainer'];

function parseLens(raw: string | string[] | undefined): Lens {
  const v = Array.isArray(raw) ? raw[0] : raw;
  return LENSES.includes(v as Lens) ? (v as Lens) : 'session';
}

function pct(n: number): string {
  return `${Math.round(n * 100)}%`;
}

export default async function EmargementsPage({
  searchParams,
}: {
  searchParams: { lens?: string; companyId?: string };
}) {
  await requireAccess('attendance');
  const lens = parseLens(searchParams.lens);
  const filters: ConsolidatedFilters = { lens, companyId: searchParams.companyId };
  const { groups, summary } = await listConsolidatedAttendance(filters);

  const hoursAtRisk = summary.hoursAtRiskRecoverable + summary.hoursAtRiskLost;

  return (
    <div className="max-w-7xl w-full mx-auto px-8 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100 tracking-tight">
          Émargements
        </h1>
        <p className="text-[14px] text-zinc-500 dark:text-zinc-400 mt-1">
          Vue consolidée des présences et de la preuve de connexion — risque de non-paiement par le financeur.
        </p>
      </header>

      <section className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <StatCard
          label="Heures à risque"
          value={`${hoursAtRisk.toFixed(1)} h`}
          icon={AlertTriangle}
          accent={hoursAtRisk > 0 ? 'amber' : 'emerald'}
          hint={
            hoursAtRisk > 0
              ? `${summary.hoursAtRiskRecoverable.toFixed(1)} h récupérables · ${summary.hoursAtRiskLost.toFixed(1)} h perdues`
              : 'tout est justifié'
          }
          hintTone={hoursAtRisk > 0 ? 'warning' : 'success'}
        />
        <StatCard label="Feuilles incomplètes" value={summary.incompleteSheets} icon={ClipboardCheck} accent="violet" />
        <StatCard
          label="Couverture preuve Zoom"
          value={pct(summary.zoomCoverage)}
          icon={Video}
          accent="blue"
        />
        <StatCard
          label="Syncs Zoom en erreur"
          value={summary.syncErrors}
          icon={ShieldCheck}
          accent={summary.syncErrors > 0 ? 'rose' : 'emerald'}
          hintTone={summary.syncErrors > 0 ? 'warning' : 'neutral'}
        />
      </section>

      <div className="flex items-center justify-between mb-3">
        <p className="text-[13px] text-zinc-500 dark:text-zinc-400">
          Taux de signatures global : <span className="font-medium text-zinc-800 dark:text-zinc-200">{pct(summary.signatureRate)}</span>
        </p>
        <LensToggle active={lens} />
      </div>

      <div className="bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-xl shadow-sm overflow-hidden">
        <div className="grid grid-cols-[1fr_120px_220px_160px] gap-3 px-5 py-2.5 text-[10px] tracking-wider uppercase text-zinc-400 dark:text-zinc-500 border-b border-zinc-200/60 dark:border-zinc-800 bg-zinc-50/40 dark:bg-zinc-950/40">
          <div>{lens === 'session' ? 'Session' : lens === 'company' ? 'Entreprise' : 'Formateur'}</div>
          <div>Feuilles</div>
          <div>Signatures</div>
          <div>Preuve</div>
        </div>

        {groups.length === 0 ? (
          <p className="px-5 py-10 text-center text-[13px] text-zinc-400">Aucune feuille d'émargement pour ce filtre.</p>
        ) : (
          <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {groups.map((g) => {
              const isFull = g.expectedCount > 0 && g.signedCount >= g.expectedCount;
              return (
                <li
                  key={g.key}
                  className="grid grid-cols-[1fr_120px_220px_160px] gap-3 px-5 py-3 items-center text-[13px]"
                >
                  <span className="text-zinc-900 dark:text-zinc-100 truncate inline-flex items-center gap-2">
                    {g.label}
                    {g.hasSyncError && (
                      <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400">
                        sync KO
                      </span>
                    )}
                  </span>
                  <span className=" text-[11px] text-zinc-600 dark:text-zinc-300 tabular-nums">{g.sheetCount}</span>
                  <div className="flex items-center gap-2">
                    <ProgressBar
                      value={g.signedCount}
                      max={Math.max(g.expectedCount, 1)}
                      tone={isFull ? 'emerald' : 'amber'}
                      size="sm"
                    />
                    <span className="text-[11px] text-zinc-700 dark:text-zinc-300 tabular-nums w-12 text-right">
                      {g.signedCount}/{g.expectedCount}
                    </span>
                  </div>
                  <span className="inline-flex items-center gap-1.5 text-[11px]">
                    <span className="px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400">
                      Zoom {g.zoomCount}
                    </span>
                    <span className="px-1.5 py-0.5 rounded-full bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                      Manuel {g.manualCount}
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
