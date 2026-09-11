import Link from 'next/link';
import { ClipboardList, ListChecks, MapPin, Video } from 'lucide-react';
import { StatusPill } from '@/shared/ui/status-pill';
import { heure, jourRelatif } from '@/features/trainer-space/dates';
import type { MySession } from '@/features/trainer-space/my-sessions';

const STATUT: Record<string, { label: string; tone: 'warning' | 'success' | 'info' }> = {
  in_progress: { label: 'en cours', tone: 'warning' },
  done: { label: 'terminée', tone: 'success' },
};

/** Carte d'une séance du formateur : horaires, lieu, émargement, visio. */
export function SessionCard({ s, organizationName, emphasize = false }: { s: MySession; organizationName?: string | null; emphasize?: boolean }) {
  const statut = STATUT[s.status] ?? { label: 'à venir', tone: 'info' as const };
  return (
    <div
      className={`rounded-xl border px-4 py-3.5 space-y-2.5 ${
        emphasize ? 'border-orange-200 dark:border-orange-900/50 bg-orange-50/40 dark:bg-orange-950/10' : 'border-zinc-200/70 dark:border-zinc-800 bg-white dark:bg-zinc-900'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] uppercase tracking-wider text-zinc-500 dark:text-zinc-400 tabular-nums">
            {jourRelatif(s.startsAt)} · {heure(s.startsAt)} – {heure(s.endsAt)}
          </p>
          <p className="text-[15px] font-medium text-zinc-900 dark:text-zinc-100 mt-0.5 truncate">{s.title}</p>
          {organizationName && <p className="text-[12px] text-zinc-500 truncate">{organizationName}</p>}
        </div>
        <StatusPill tone={statut.tone}>{statut.label}</StatusPill>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-[12px] text-zinc-500 dark:text-zinc-400 inline-flex items-center gap-1.5 min-w-0">
          {s.modality === 'distanciel' ? <Video className="w-3.5 h-3.5 flex-shrink-0" /> : <MapPin className="w-3.5 h-3.5 flex-shrink-0" />}
          <span className="truncate">{s.location ?? (s.modality === 'distanciel' ? 'À distance' : 'Lieu à préciser')}</span>
        </span>
        <div className="flex items-center gap-2">
          {s.remoteUrl && (
            <a
              href={s.remoteUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-[12px] font-medium px-2.5 py-1.5 rounded-md text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/40 hover:bg-blue-100"
            >
              <Video className="w-3.5 h-3.5" /> Visio
            </a>
          )}
          <Link
            href={`/seance/${s.id}/questionnaires`}
            className="inline-flex items-center gap-1 text-[12px] font-medium px-2.5 py-1.5 rounded-md border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800"
          >
            <ListChecks className="w-3.5 h-3.5" /> Questionnaires
          </Link>
          <Link
            href={`/emarger/${s.id}`}
            className="inline-flex items-center gap-1 text-[12px] font-medium px-2.5 py-1.5 rounded-md bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 hover:opacity-90"
          >
            <ClipboardList className="w-3.5 h-3.5" /> Émargement
          </Link>
        </div>
      </div>
    </div>
  );
}
