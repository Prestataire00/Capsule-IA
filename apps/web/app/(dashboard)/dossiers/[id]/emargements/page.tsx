// ARCHETYPE: command
// Justification: vue consolidée des feuilles d'émargement par session pour le gestionnaire.

import { notFound } from 'next/navigation';
import Link from 'next/link';
import { format, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';
import { dossiers, sessionsByDossier, trainerFullName } from '@/shared/mock/data';
import { SectionLabel } from '@/shared/ui/section-label';
import { StatusPill } from '@/shared/ui/status-pill';
import { InfoCallout } from '@/shared/ui/info-callout';

export default function EmargementsPage({ params }: { params: { id: string } }) {
  const dossier = dossiers.find((d) => d.id === params.id);
  if (!dossier) notFound();
  const sessions = sessionsByDossier[params.id] ?? [];
  const incomplete = sessions.filter(
    (s) => (s.status === 'done' || s.status === 'in_progress') && s.attendanceCount < s.attendanceTotal,
  );

  return (
    <div className="space-y-4">
      <header>
        <SectionLabel className="mb-1">Émargements</SectionLabel>
        <p className="text-[13px] text-zinc-500 dark:text-zinc-400">
          {sessions.length} feuille{sessions.length > 1 ? 's' : ''} ·{' '}
          {incomplete.length === 0 ? (
            <span className="text-emerald-600">toutes complètes</span>
          ) : (
            <span className="text-amber-600">{incomplete.length} incomplète{incomplete.length > 1 ? 's' : ''}</span>
          )}
        </p>
      </header>

      {incomplete.length > 0 && (
        <InfoCallout tone="warning">
          <p className="font-medium">{incomplete.length} feuille(s) à finaliser.</p>
          <p className="text-[11px] mt-1">
            L'émargement Qualiopi exige une signature par participant et par demi-journée. Le formateur peut le faire depuis son <Link href="/mes-sessions" className="underline">espace mobile</Link>.
          </p>
        </InfoCallout>
      )}

      <ul className="border-y border-zinc-200/60 dark:border-zinc-800 divide-y divide-zinc-200/60 dark:divide-zinc-800">
        {sessions.map((s) => {
          const ratio = s.attendanceTotal > 0 ? s.attendanceCount / s.attendanceTotal : 0;
          const tone = s.status === 'planned' ? 'neutral' : ratio === 1 ? 'success' : 'warning';
          return (
            <li key={s.id} className="grid grid-cols-[140px_1fr_120px_120px] gap-3 py-3 px-1 text-[13px] items-center">
              <span className="font-mono text-[11px] text-zinc-500">
                {format(parseISO(s.startsAt), 'dd/MM HH:mm', { locale: fr })}
              </span>
              <span className="text-zinc-900 dark:text-zinc-100">{trainerFullName(s.trainerId)}</span>
              <span className="font-mono text-[11px] text-zinc-700 dark:text-zinc-300">
                {s.attendanceCount}/{s.attendanceTotal} signé{s.attendanceTotal > 1 ? 's' : ''}
              </span>
              <StatusPill tone={tone}>
                {s.status === 'planned' ? 'à venir' : ratio === 1 ? 'finalisée' : 'incomplète'}
              </StatusPill>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
