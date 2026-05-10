// ARCHETYPE: command
// Justification: planning chronologique des sessions du dossier avec statut, formateur, émargement.

import { notFound } from 'next/navigation';
import Link from 'next/link';
import { Plus, MapPin, Video } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';
import { dossiers, sessionsByDossier, trainerFullName } from '@/shared/mock/data';
import { SectionLabel } from '@/shared/ui/section-label';
import { StatusPill } from '@/shared/ui/status-pill';

export default function SessionsPage({ params }: { params: { id: string } }) {
  const dossier = dossiers.find((d) => d.id === params.id);
  if (!dossier) notFound();
  const sessions = sessionsByDossier[params.id] ?? [];

  return (
    <div>
      <header className="flex items-center justify-between mb-4">
        <div>
          <SectionLabel className="mb-1">Sessions</SectionLabel>
          <p className="text-[13px] text-zinc-500 dark:text-zinc-400">
            {sessions.length} session{sessions.length > 1 ? 's' : ''} ·{' '}
            <span className="text-emerald-600">{sessions.filter((s) => s.status === 'done').length} terminées</span>
          </p>
        </div>
        <button
          type="button"
          className="border border-zinc-200/60 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 text-[13px] px-3 py-1.5 rounded-md hover:bg-zinc-50 dark:hover:bg-zinc-900 transition inline-flex items-center gap-2"
        >
          <Plus className="w-3.5 h-3.5" />
          Planifier une session
        </button>
      </header>

      {sessions.length === 0 ? (
        <div className="border border-dashed border-zinc-200/60 dark:border-zinc-800 rounded-md py-12 text-center">
          <p className="text-[13px] text-zinc-500">Aucune session planifiée.</p>
        </div>
      ) : (
        <ul className="border-y border-zinc-200/60 dark:border-zinc-800 divide-y divide-zinc-200/60 dark:divide-zinc-800">
          {sessions.map((s) => (
            <li key={s.id} className="grid grid-cols-[140px_120px_1fr_140px_140px_100px] gap-3 py-3 px-1 items-center text-[13px]">
              <span className="font-mono text-[11px] text-zinc-500 dark:text-zinc-400">
                {format(parseISO(s.startsAt), 'EEE dd/MM', { locale: fr })}
              </span>
              <span className="font-mono text-[11px] text-zinc-700 dark:text-zinc-300">
                {format(parseISO(s.startsAt), 'HH:mm')} → {format(parseISO(s.endsAt), 'HH:mm')}
              </span>
              <span className="text-zinc-900 dark:text-zinc-100">{trainerFullName(s.trainerId)}</span>
              <span className="text-zinc-500 dark:text-zinc-400 text-[11px] inline-flex items-center gap-1.5">
                {s.modality === 'distanciel' ? <Video className="w-3 h-3" /> : <MapPin className="w-3 h-3" />}
                {s.location ?? 'distanciel'}
              </span>
              <span className="font-mono text-[11px] text-zinc-500">
                {s.attendanceCount}/{s.attendanceTotal} signé{s.attendanceTotal > 1 ? 's' : ''}
              </span>
              <StatusPill tone={s.status === 'done' ? 'success' : s.status === 'in_progress' ? 'warning' : 'info'}>
                {s.status === 'done' ? 'fait' : s.status === 'in_progress' ? 'en cours' : 'planifié'}
              </StatusPill>
            </li>
          ))}
        </ul>
      )}

      <p className="text-[11px] text-zinc-400 mt-4">
        Les feuilles d'émargement s'ouvrent depuis l'<Link href="/mes-sessions" className="underline">espace formateur</Link>.
      </p>
    </div>
  );
}
