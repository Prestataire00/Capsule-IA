import Link from 'next/link';
import { ArrowLeft, Users, BookOpen, MessagesSquare } from 'lucide-react';

/**
 * En-tête commun aux pages d'une séance côté formateur.
 *
 * Le créneau et le titre tiennent dans une carte teintée, et chaque onglet
 * porte son pictogramme coloré : trois rubriques qui se ressemblaient se
 * distinguent maintenant sans être lues.
 */

const ONGLETS = [
  {
    cle: 'seance' as const,
    label: 'La séance',
    icone: Users,
    doux: 'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300',
  },
  {
    cle: 'supports' as const,
    label: 'Supports de cours',
    icone: BookOpen,
    doux: 'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300',
  },
  {
    cle: 'messages' as const,
    label: 'Messages',
    icone: MessagesSquare,
    doux: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300',
  },
];

export function SeanceNav({
  sessionId,
  quand,
  titre,
  sousTitre,
  actif,
}: {
  sessionId: string;
  quand: string;
  titre: string;
  sousTitre?: string;
  actif: 'seance' | 'supports' | 'messages';
}) {
  return (
    <div className="space-y-4">
      <Link
        href="/mes-sessions"
        className="text-[12px] font-medium text-zinc-500 inline-flex items-center gap-1.5 hover:text-zinc-800 dark:hover:text-zinc-200 transition"
      >
        <ArrowLeft className="w-3 h-3" /> Mes sessions
      </Link>

      <header className="relative overflow-hidden rounded-2xl border border-sky-100/70 dark:border-sky-900/30 bg-gradient-to-br from-sky-50 via-white to-white dark:from-sky-950/30 dark:via-zinc-900 dark:to-zinc-900 p-5 shadow-sm">
        <span className="absolute left-0 top-0 bottom-0 w-1.5 bg-sky-500" aria-hidden />
        <div className="pl-2">
          <p className="text-[11px] font-bold uppercase tracking-[0.06em] text-sky-600 dark:text-sky-400 tabular-nums">{quand}</p>
          <h1 className="text-[22px] font-extrabold text-zinc-900 dark:text-zinc-100 tracking-tight mt-1">{titre}</h1>
          {sousTitre && <p className="text-[13px] text-zinc-600 dark:text-zinc-400 mt-1.5">{sousTitre}</p>}
        </div>
      </header>

      <nav className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
        {ONGLETS.map((o) => {
          const estActif = o.cle === actif;
          const Icone = o.icone;
          return (
            <Link
              key={o.cle}
              href={o.cle === 'seance' ? `/seance/${sessionId}` : `/seance/${sessionId}/${o.cle}`}
              aria-current={estActif ? 'page' : undefined}
              className={`inline-flex items-center gap-2 pl-1.5 pr-3 py-1.5 rounded-xl text-[13px] whitespace-nowrap transition ${
                estActif
                  ? 'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 font-semibold shadow-sm'
                  : 'text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800/70'
              }`}
            >
              <span className={`w-7 h-7 rounded-lg grid place-items-center shrink-0 ${o.doux}`}>
                <Icone className="w-4 h-4" />
              </span>
              {o.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
