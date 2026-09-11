import Link from 'next/link';
import { ArrowUpRight, Clock, AlertTriangle } from 'lucide-react';
import { StatusPill, dossierStatusLabel, dossierStatusTone } from '@/shared/ui/status-pill';
import type { LearnerDossier } from './summary';
import { VoirEspaceButton } from './voir-espace-button';

const fmtDate = (iso: string | null) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(2, 4)}` : '—');
const modalityLabel = (m: string) =>
  (({ presentiel: 'Présentiel', distanciel: 'Distanciel', hybride: 'Hybride' }) as Record<string, string>)[m] ?? m;

export function DossierCard({ dossier }: { dossier: LearnerDossier }) {
  const h = dossier.hours;
  return (
    <div className="bg-white dark:bg-zinc-900 border border-zinc-200/70 dark:border-zinc-800 rounded-xl p-5 shadow-sm hover:shadow-md hover:border-orange-200 dark:hover:border-orange-900/60 transition">
      <Link href={`/dossiers/${dossier.id}`} className="group block">
      <div className="flex items-start justify-between mb-3 gap-3">
        <div className="min-w-0">
          <p className="text-[12px] font-mono text-zinc-500 dark:text-zinc-400">{dossier.reference}</p>
          <p className="text-[14px] font-extrabold text-zinc-900 dark:text-zinc-100 truncate">
            {dossier.formationTitle ?? '—'}
          </p>
        </div>
        <ArrowUpRight className="w-4 h-4 text-zinc-300 dark:text-zinc-600 group-hover:text-orange-600 transition flex-shrink-0" />
      </div>

      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <StatusPill tone={dossierStatusTone(dossier.status)}>{dossierStatusLabel(dossier.status)}</StatusPill>
        <span className="inline-flex items-center h-6 px-2 rounded-md text-[12px] font-semibold bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
          {modalityLabel(dossier.modality)}
        </span>
        {h?.at_risk && (
          <StatusPill tone="danger">
            <AlertTriangle className="w-3 h-3 -ml-0.5" /> à risque
          </StatusPill>
        )}
      </div>

      <div className="flex items-center justify-between text-[12px] text-zinc-600 dark:text-zinc-400 tabular-nums">
        <span>{fmtDate(dossier.start_date)} → {fmtDate(dossier.end_date)}</span>
        {h && (
          <span className="inline-flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {Number(h.hours_attended)}/{Number(h.hours_planned)} h · {Number(h.attendance_rate)}%
          </span>
        )}
      </div>
      </Link>

      <div className="mt-3 pt-3 border-t border-zinc-100 dark:border-zinc-800">
        <VoirEspaceButton dossierId={dossier.id} />
      </div>
    </div>
  );
}
