import type { AuthorKind, SessionMessage } from '@/features/trainer-space/session-messages';

/**
 * Le fil d'une séance, vu par l'un des trois côtés. `moi` décale les bulles :
 * un formateur doit reconnaître ses propres messages d'un coup d'œil, sans
 * lire l'auteur.
 */

const TON: Record<AuthorKind, string> = {
  formateur: 'bg-orange-100 text-orange-700 dark:bg-orange-950/60 dark:text-orange-300',
  organisme: 'bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300',
  apprenant: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300',
};

const ROLE: Record<AuthorKind, string> = {
  formateur: 'Formateur',
  organisme: 'Organisme',
  apprenant: 'Participant',
};

const horodatage = new Intl.DateTimeFormat('fr-FR', {
  timeZone: 'Europe/Paris',
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
});

export function MessageThread({
  messages,
  moi,
  vide = 'Aucun message pour l’instant.',
}: {
  messages: readonly SessionMessage[];
  moi: AuthorKind;
  vide?: string;
}) {
  if (messages.length === 0) {
    return <p className="text-[13px] text-zinc-400 text-center py-8">{vide}</p>;
  }

  return (
    <ul className="space-y-3">
      {messages.map((m) => {
        const mien = m.authorKind === moi;
        return (
          <li key={m.id} className={`flex gap-2.5 ${mien ? 'flex-row-reverse' : ''}`}>
            <span
              className={`w-8 h-8 rounded-full grid place-items-center text-[11px] font-bold flex-shrink-0 ${TON[m.authorKind]}`}
              title={ROLE[m.authorKind]}
            >
              {m.authorName.slice(0, 2).toUpperCase()}
            </span>
            <div className={`min-w-0 max-w-[80%] ${mien ? 'text-right' : ''}`}>
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                <span className="font-medium text-zinc-700 dark:text-zinc-300">{m.authorName}</span>
                {' · '}
                {ROLE[m.authorKind]}
                {' · '}
                <span className="tabular-nums">{horodatage.format(new Date(m.createdAt))}</span>
              </p>
              <div
                className={`mt-1 inline-block text-left text-[13px] leading-relaxed px-3.5 py-2.5 rounded-xl whitespace-pre-wrap break-words ${
                  mien
                    ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
                    : 'bg-white dark:bg-zinc-900 border border-zinc-200/70 dark:border-zinc-800 text-zinc-800 dark:text-zinc-200'
                }`}
              >
                {m.body}
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
