import Link from 'next/link';
import { ArrowUpRight, Clock, AlertTriangle } from 'lucide-react';
import { StatusPill, dossierStatusLabel, dossierStatusTone } from '@/shared/ui/status-pill';
import type { LearnerDossier } from './summary';

const fmtDate = (iso: string | null) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(2, 4)}` : '—');
const modalityLabel = (m: string) =>
  (({ presentiel: 'Présentiel', distanciel: 'Distanciel', hybride: 'Hybride' }) as Record<string, string>)[m] ?? m;

export function DossierCard({ dossier }: { dossier: LearnerDossier }) {
  const h = dossier.hours;
  return (
    <Link
      href={`/dossiers/${dossier.id}`}
      className="group block bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-xl p-5 shadow-sm hover:shadow-md hover:border-violet-200 dark:hover:border-violet-900/60 transition"
    >
      <div className="flex items-start justify-between mb-3 gap-3">
        <div className="min-w-0">
          <p className="text-[13px] font-mono text-zinc-500 dark:text-zinc-400">{dossier.reference}</p>
          <p className="text-[14px] font-medium text-zinc-900 dark:text-zinc-100 truncate">
            {dossier.formationTitle ?? '—'}
          </p>
        </div>
        <ArrowUpRight className="w-4 h-4 text-zinc-300 dark:text-zinc-600 group-hover:text-violet-600 transition flex-shrink-0" />
      </div>

      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <StatusPill tone={dossierStatusTone(dossier.status)}>{dossierStatusLabel(dossier.status)}</StatusPill>
        <span className="text-[11px] text-zinc-500 dark:text-zinc-400">{modalityLabel(dossier.modality)}</span>
        {h?.at_risk && (
          <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-400 inline-flex items-center gap-1">
            <AlertTriangle className="w-2.5 h-2.5" /> à risque
          </span>
        )}
      </div>

      <div className="flex items-center justify-between text-[12px] text-zinc-600 dark:text-zinc-400">
        <span>{fmtDate(dossier.start_date)} → {fmtDate(dossier.end_date)}</span>
        {h && (
          <span className="inline-flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {Number(h.hours_attended)}/{Number(h.hours_planned)} h · {Number(h.attendance_rate)}%
          </span>
        )}
      </div>
    </Link>
  );
}
