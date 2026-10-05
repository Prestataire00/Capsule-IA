import type { MessageEquipe } from '../store';
import { morceauxDuMessage } from '../mentions';

const dateFmt = new Intl.DateTimeFormat('fr-FR', {
  timeZone: 'Europe/Paris',
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
});

/** Le fil d'un dossier : les mentions ressortent, celles qui me visent davantage. */
export function FilMessages({
  messages,
  noms,
  meId,
}: {
  messages: readonly MessageEquipe[];
  /** Noms de l'équipe, pour faire ressortir les @mentions. */
  noms: readonly string[];
  meId: string;
}) {
  if (messages.length === 0) {
    return (
      <p className="text-[13px] text-zinc-500 dark:text-zinc-400 py-8 text-center">
        Aucun message. Écrivez le premier en mentionnant la personne concernée.
      </p>
    );
  }
  return (
    <ol className="space-y-3">
      {messages.map((m) => {
        const moi = m.authorUserId === meId;
        const pourMoi = m.mentions.includes(meId);
        return (
          <li key={m.id} className={`flex ${moi ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 shadow-sm ${
                moi
                  ? 'bg-orange-50 dark:bg-orange-950/30 border border-orange-100 dark:border-orange-900/40'
                  : pourMoi
                    ? 'bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/50'
                    : 'bg-white dark:bg-zinc-900 border border-zinc-200/70 dark:border-zinc-800'
              }`}
            >
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400 tabular-nums">
                <span className="font-medium text-zinc-700 dark:text-zinc-300">{m.authorName}</span> ·{' '}
                {dateFmt.format(new Date(m.createdAt))}
              </p>
              <p className="text-[13px] text-zinc-800 dark:text-zinc-200 whitespace-pre-wrap mt-0.5">
                {morceauxDuMessage(m.body, noms).map((x, i) =>
                  x.mention ? (
                    <span key={i} className="font-medium text-rose-700 dark:text-rose-300">
                      {x.texte}
                    </span>
                  ) : (
                    <span key={i}>{x.texte}</span>
                  ),
                )}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
