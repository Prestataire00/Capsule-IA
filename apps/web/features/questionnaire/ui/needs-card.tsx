import { CHAMPS_BESOIN, NIVEAUX, type FicheBesoin } from '@/features/questionnaire/session-needs';
import { StatusPill } from '@/shared/ui/status-pill';

/**
 * Fiche besoin d'un participant, rendue à l'identique côté organisme (onglet
 * Fiches besoin de la séance) et côté formateur (ses séances).
 */

const dateCourte = (iso: string) =>
  new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', dateStyle: 'medium' }).format(new Date(iso));

function Ligne({ label, valeur }: { label: string; valeur: string | null | undefined }) {
  if (!valeur) return null;
  return (
    <div className="text-[13px]">
      <dt className="text-zinc-500 dark:text-zinc-400">{label}</dt>
      <dd className="text-zinc-800 dark:text-zinc-200 whitespace-pre-line">{valeur}</dd>
    </div>
  );
}

export function NeedsCard({ fiche, entete }: { fiche: FicheBesoin; entete?: React.ReactNode }) {
  const niveau = fiche.answers.currentLevel
    ? (NIVEAUX[fiche.answers.currentLevel] ?? String(fiche.answers.currentLevel))
    : null;
  return (
    <li className="bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-lg p-4 space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          {entete ?? <p className="text-[14px] font-medium text-zinc-900 dark:text-zinc-100">{fiche.name}</p>}
          {fiche.companyName && <p className="text-[12px] text-zinc-500">{fiche.companyName}</p>}
        </div>
        {fiche.statut === 'recue' ? (
          <StatusPill tone="success">
            {fiche.source === 'inscription' ? 'Remplie à l’inscription' : 'Reçue'}
            {fiche.dateIso ? ` le ${dateCourte(fiche.dateIso)}` : ''}
          </StatusPill>
        ) : fiche.statut === 'envoyee' ? (
          <StatusPill tone="info">Envoyée, en attente</StatusPill>
        ) : (
          <StatusPill tone="neutral">Non envoyée</StatusPill>
        )}
      </div>

      {fiche.statut === 'recue' ? (
        <dl className="grid sm:grid-cols-2 gap-3">
          <Ligne label="Niveau actuel" valeur={niveau} />
          {CHAMPS_BESOIN.map((c) => (
            <Ligne key={c.cle} label={c.label} valeur={fiche.answers[c.cle] as string | null | undefined} />
          ))}
        </dl>
      ) : (
        <p className="text-[12px] text-zinc-500">
          {fiche.statut === 'envoyee'
            ? 'Le participant n’a pas encore répondu.'
            : 'Aucune analyse des besoins pour ce participant.'}
        </p>
      )}
    </li>
  );
}
