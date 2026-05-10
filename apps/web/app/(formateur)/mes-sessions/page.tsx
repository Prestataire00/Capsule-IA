// ARCHETYPE: command
// Justification: liste mobile-first des sessions du formateur avec gros boutons.

import Link from 'next/link';
import { format, parseISO, isToday, isTomorrow } from 'date-fns';
import { fr } from 'date-fns/locale';
import { ArrowRight, MapPin, Video } from 'lucide-react';
import { sessionsByDossier, dossiers, formationTitle } from '@/shared/mock/data';
import { SectionLabel } from '@/shared/ui/section-label';
import { StatusPill } from '@/shared/ui/status-pill';

const todayLabel = (iso: string) => {
  const d = parseISO(iso);
  if (isToday(d)) return "Aujourd'hui";
  if (isTomorrow(d)) return 'Demain';
  return format(d, 'EEEE d MMMM', { locale: fr });
};

export default function MesSessionsPage() {
  const sessions = Object.entries(sessionsByDossier)
    .flatMap(([dossierId, list]) =>
      list
        .filter((s) => s.trainerId === 't-1')
        .map((s) => ({ ...s, dossierId })),
    )
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));

  return (
    <div className="max-w-md w-full mx-auto px-4 py-6">
      <header className="mb-6">
        <SectionLabel className="mb-1">Marc Dupont</SectionLabel>
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100 tracking-tight">Mes sessions</h1>
        <p className="text-[13px] text-zinc-500 dark:text-zinc-400 mt-1">
          {sessions.length} session{sessions.length > 1 ? 's' : ''} à venir ou en cours
        </p>
      </header>

      <ul className="space-y-2">
        {sessions.map((s) => {
          const dossier = dossiers.find((d) => d.id === s.dossierId);
          if (!dossier) return null;
          const tone = s.status === 'in_progress' ? 'warning' : s.status === 'done' ? 'success' : 'info';
          return (
            <li key={s.id}>
              <Link
                href={`/emarger/${s.id}`}
                className="block bg-zinc-50 dark:bg-zinc-900 rounded-lg px-4 py-3.5 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition"
              >
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] tracking-wider uppercase text-zinc-500 dark:text-zinc-400">
                      {todayLabel(s.startsAt)} · {format(parseISO(s.startsAt), 'HH:mm')} – {format(parseISO(s.endsAt), 'HH:mm')}
                    </p>
                    <p className="text-[15px] font-medium mt-1 truncate">{formationTitle(dossier.formationId)}</p>
                  </div>
                  <ArrowRight className="w-4 h-4 text-zinc-400 mt-1 flex-shrink-0" />
                </div>
                <div className="flex items-center justify-between gap-2 text-[11px]">
                  <span className="text-zinc-500 dark:text-zinc-400 inline-flex items-center gap-1.5">
                    {s.modality === 'distanciel' ? <Video className="w-3 h-3" /> : <MapPin className="w-3 h-3" />}
                    {s.location ?? 'distanciel'}
                  </span>
                  <StatusPill tone={tone}>
                    {s.status === 'done' ? 'fait' : s.status === 'in_progress' ? 'en cours' : 'à venir'}
                  </StatusPill>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>

      {sessions.length === 0 && (
        <p className="text-[13px] text-zinc-400 text-center py-12">
          Aucune session pour vous à venir.
        </p>
      )}
    </div>
  );
}
