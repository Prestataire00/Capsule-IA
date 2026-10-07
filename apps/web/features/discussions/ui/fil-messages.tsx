import { FileText } from 'lucide-react';
import type { MessageEquipe } from '../store';
import { morceauxDuMessage } from '../mentions';

const TZ = 'Europe/Paris';
const jourFmt = new Intl.DateTimeFormat('fr-FR', {
  timeZone: TZ,
  weekday: 'long',
  day: 'numeric',
  month: 'long',
});
const cleJour = new Intl.DateTimeFormat('en-CA', {
  timeZone: TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});
const heureFmt = new Intl.DateTimeFormat('fr-FR', {
  timeZone: TZ,
  hour: '2-digit',
  minute: '2-digit',
});

const taille = (o: number) =>
  o < 1024 * 1024
    ? `${Math.max(1, Math.round(o / 1024))} Ko`
    : `${(o / 1024 / 1024).toFixed(1).replace('.', ',')} Mo`;

const initiales = (nom: string) =>
  nom
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((m) => m[0]?.toUpperCase() ?? '')
    .join('') || '?';

/**
 * Le fil d'un dossier, jour par jour : chaque message avec son auteur et son
 * heure ; les mentions ressortent, et un message qui me mentionne se repère
 * d'un coup d'œil.
 */
export function FilMessages({
  messages,
  noms,
  meId,
  vide,
}: {
  messages: readonly MessageEquipe[];
  /** Noms de l'équipe, pour faire ressortir les @mentions. */
  noms: readonly string[];
  meId: string;
  vide?: string;
}) {
  if (messages.length === 0) {
    return (
      <p className="text-[13px] text-zinc-500 dark:text-zinc-400 py-10 text-center">
        {vide ?? 'Aucun message. Écrivez le premier en mentionnant la personne concernée.'}
      </p>
    );
  }

  const jours: Array<{ cle: string; libelle: string; messages: MessageEquipe[] }> = [];
  for (const m of messages) {
    const cle = cleJour.format(new Date(m.createdAt));
    const dernier = jours[jours.length - 1];
    if (dernier?.cle === cle) dernier.messages.push(m);
    else jours.push({ cle, libelle: jourFmt.format(new Date(m.createdAt)), messages: [m] });
  }

  return (
    <div className="space-y-5">
      {jours.map((j) => (
        <section key={j.cle} className="space-y-4" aria-label={j.libelle}>
          <div className="flex items-center gap-3 text-[12px] text-zinc-500 dark:text-zinc-400">
            <span className="h-px flex-1 bg-zinc-200 dark:bg-zinc-800" />
            <span className="first-letter:uppercase">{j.libelle}</span>
            <span className="h-px flex-1 bg-zinc-200 dark:bg-zinc-800" />
          </div>
          <ol className="space-y-4">
            {j.messages.map((m) => {
              const moi = m.authorUserId === meId;
              const pourMoi = m.mentions.includes(meId);
              return (
                <li
                  key={m.id}
                  className={`flex gap-3 ${pourMoi ? 'rounded-lg bg-rose-50/70 dark:bg-rose-950/20 -mx-2 px-2 py-1.5 ring-1 ring-rose-100 dark:ring-rose-900/40' : ''}`}
                >
                  <span
                    className={`w-8 h-8 rounded-full grid place-items-center shrink-0 text-[11px] font-semibold ${
                      moi
                        ? 'bg-orange-100 text-orange-700 dark:bg-orange-950/60 dark:text-orange-300'
                        : 'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300'
                    }`}
                    aria-hidden
                  >
                    {initiales(m.authorName)}
                  </span>
                  <div className="min-w-0">
                    <p className="text-[13px]">
                      <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                        {moi ? 'Vous' : m.authorName}
                      </span>{' '}
                      <span className="text-[12px] text-zinc-400 tabular-nums">
                        {heureFmt.format(new Date(m.createdAt))}
                      </span>
                    </p>
                    {m.body.trim() && (
                      <p className="text-[14px] leading-relaxed text-zinc-800 dark:text-zinc-200 whitespace-pre-wrap break-words">
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
                    )}
                    {m.pieces && m.pieces.length > 0 && (
                      <ul className="mt-1.5 flex flex-wrap gap-2">
                        {m.pieces.map((p) => (
                          <li key={p.lien}>
                            <a
                              href={p.lien}
                              target="_blank"
                              rel="noopener"
                              className="inline-flex items-center gap-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 shadow-sm hover:shadow-md max-w-[280px]"
                            >
                              <span className="w-7 h-7 rounded-md grid place-items-center shrink-0 bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300">
                                <FileText className="w-3.5 h-3.5" />
                              </span>
                              <span className="min-w-0">
                                <span className="block text-[13px] font-medium text-zinc-900 dark:text-zinc-100 truncate">
                                  {p.nom}
                                </span>
                                <span className="block text-[11px] text-zinc-500 dark:text-zinc-400 tabular-nums">
                                  {taille(p.taille)}
                                </span>
                              </span>
                            </a>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        </section>
      ))}
    </div>
  );
}
