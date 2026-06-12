// ARCHETYPE: command
// Justification: feuille d'émargement d'une séance — vue gestionnaire (mock, cohérent avec la liste).

import { notFound } from 'next/navigation';
import Link from 'next/link';
import { format, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';
import {
  dossiers,
  sessionsByDossier,
  formationTitle,
  trainerFullName,
  learnerFullName,
} from '@/shared/mock/data';
import { SectionLabel } from '@/shared/ui/section-label';
import { StatusPill } from '@/shared/ui/status-pill';

const MODALITY_LABELS: Record<string, string> = {
  presentiel: 'Présentiel',
  distanciel: 'Distanciel',
  hybride: 'Hybride',
  afest: 'AFEST',
};

export default function EmargementSessionPage({
  params,
}: {
  params: { id: string; sessionId: string };
}) {
  const dossier = dossiers.find((d) => d.id === params.id);
  if (!dossier) notFound();

  const sessions = sessionsByDossier[params.id] ?? [];
  const sessionIndex = sessions.findIndex((s) => s.id === params.sessionId);
  const session = sessions[sessionIndex];
  if (!session) notFound();

  // Signataires de la feuille = apprenant(s) du dossier. Le formateur émarge à part (en-tête).
  const learnerIds = [dossier.learnerId];
  const participants = learnerIds.map((id, i) => ({
    id,
    fullName: learnerFullName(id),
    // Le mock encode le nombre de signatures via attendanceCount : on marque les
    // premiers participants comme signés, de façon déterministe.
    signed: i < session.attendanceCount,
  }));

  const signedCount = participants.filter((p) => p.signed).length;
  const allSigned = participants.length > 0 && signedCount === participants.length;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <Link
          href={`/dossiers/${params.id}/emargements`}
          className="text-[12px] text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 transition"
        >
          ← Toutes les feuilles
        </Link>
      </div>

      <header>
        <SectionLabel className="mb-1">Émargement · Séance {sessionIndex + 1}</SectionLabel>
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100 tracking-tight">
          {formationTitle(dossier.formationId)}
        </h1>
        <p className="text-[13px] text-zinc-500 dark:text-zinc-400 mt-1">
          {format(parseISO(session.startsAt), 'EEEE d MMMM yyyy', { locale: fr })} ·{' '}
          {format(parseISO(session.startsAt), 'HH:mm', { locale: fr })}–
          {format(parseISO(session.endsAt), 'HH:mm', { locale: fr })} ·{' '}
          {MODALITY_LABELS[session.modality] ?? session.modality}
          {session.location ? ` · ${session.location}` : ''}
        </p>
        <p className="text-[12px] text-zinc-500 dark:text-zinc-400 mt-0.5">
          Formateur : <span className="text-zinc-700 dark:text-zinc-300">{trainerFullName(session.trainerId)}</span>
        </p>
      </header>

      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-lg p-3">
          <p className="text-[10px] uppercase tracking-wider text-zinc-400 font-semibold mb-1">Participants</p>
          <p className="text-[18px] font-semibold text-zinc-900 dark:text-zinc-100">{participants.length}</p>
        </div>
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-lg p-3">
          <p className="text-[10px] uppercase tracking-wider text-zinc-400 font-semibold mb-1">Signatures</p>
          <p className="text-[18px] font-semibold text-emerald-600 dark:text-emerald-400">
            {signedCount} / {participants.length}
          </p>
        </div>
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-lg p-3">
          <p className="text-[10px] uppercase tracking-wider text-zinc-400 font-semibold mb-1">Statut</p>
          <p className="text-[13px] font-semibold text-zinc-900 dark:text-zinc-100">
            {allSigned ? '✅ Complète' : '⏳ En cours'}
          </p>
        </div>
      </div>

      <ul className="border-y border-zinc-200/60 dark:border-zinc-800 divide-y divide-zinc-200/60 dark:divide-zinc-800">
        {participants.map((p) => (
          <li
            key={p.id}
            className="flex items-center justify-between py-3 px-1 text-[13px]"
          >
            <span className="text-zinc-900 dark:text-zinc-100">{p.fullName}</span>
            <StatusPill tone={p.signed ? 'success' : 'warning'}>
              {p.signed ? 'signé' : 'en attente'}
            </StatusPill>
          </li>
        ))}
      </ul>

      <p className="text-[11px] text-zinc-400">
        L'émargement Qualiopi exige une signature par participant et par demi-journée (indicateur I22).
      </p>
    </div>
  );
}
