import Link from 'next/link';
import { ArrowLeft, Users, BookOpen, MessagesSquare, ListChecks, ClipboardList, Star, PenLine } from 'lucide-react';

/**
 * En-tête et onglets d'une séance, côté formateur.
 *
 * Tout ce qui concerne la journée qu'il animera tient ici : qui il a en face,
 * ce qu'il donne, ce qu'il fait faire, ce qu'il signe. Auparavant la moitié de
 * ces pages était atteignable par des « raccourcis » en bas de la fiche, et
 * l'autre par des onglets — on ne savait plus où chercher.
 */

const ONGLETS = [
  {
    cle: 'seance' as const,
    label: 'La séance',
    icone: Users,
    doux: 'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300',
    chemin: '',
  },
  {
    cle: 'cours' as const,
    label: 'Mon cours',
    icone: ListChecks,
    doux: 'bg-purple-100 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300',
    chemin: '/cours',
  },
  {
    cle: 'supports' as const,
    label: 'Supports',
    icone: BookOpen,
    doux: 'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300',
    chemin: '/supports',
  },
  {
    cle: 'fiches-besoin' as const,
    label: 'Fiches besoin',
    icone: ClipboardList,
    doux: 'bg-sky-100 text-sky-700 dark:bg-sky-950/60 dark:text-sky-300',
    chemin: '/fiches-besoin',
  },
  {
    cle: 'questionnaires' as const,
    label: 'Questionnaires',
    icone: Star,
    doux: 'bg-teal-100 text-teal-700 dark:bg-teal-950/60 dark:text-teal-300',
    chemin: '/questionnaires',
  },
  {
    cle: 'messages' as const,
    label: 'Messages',
    icone: MessagesSquare,
    doux: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300',
    chemin: '/messages',
  },
];

export type OngletSeance = (typeof ONGLETS)[number]['cle'];

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
  actif: OngletSeance;
}) {
  return (
    <div className="space-y-4">
      <Link
        href="/mes-sessions"
        className="text-[12px] font-medium text-zinc-500 inline-flex items-center gap-1.5 hover:text-zinc-800 dark:hover:text-zinc-200 transition"
      >
        <ArrowLeft className="w-3 h-3" /> Mes séances
      </Link>

      <header className="relative overflow-hidden rounded-2xl border border-sky-100/70 dark:border-sky-900/30 bg-gradient-to-br from-sky-50 via-white to-white dark:from-sky-950/30 dark:via-zinc-900 dark:to-zinc-900 p-5 shadow-sm">
        <span className="absolute left-0 top-0 bottom-0 w-1.5 bg-sky-500" aria-hidden />
        <div className="pl-2 flex items-start justify-between gap-4 flex-wrap">
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-[0.06em] text-sky-600 dark:text-sky-400 tabular-nums">
              {quand}
            </p>
            <h1 className="text-[22px] font-extrabold text-zinc-900 dark:text-zinc-100 tracking-tight mt-1">{titre}</h1>
            {sousTitre && <p className="text-[13px] text-zinc-600 dark:text-zinc-400 mt-1.5 max-w-xl">{sousTitre}</p>}
          </div>
          {/* L'émargement est l'acte de la séance : il ne se cherche pas parmi les onglets. */}
          <Link
            href={`/emarger/${sessionId}`}
            className="h-9 px-4 rounded-lg bg-orange-500 hover:bg-orange-600 text-white text-[13px] font-semibold inline-flex items-center gap-1.5 shadow-sm shadow-orange-500/30 transition shrink-0"
          >
            <PenLine className="w-3.5 h-3.5" /> Émarger
          </Link>
        </div>
      </header>

      <nav className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
        {ONGLETS.map((o) => {
          const estActif = o.cle === actif;
          const Icone = o.icone;
          return (
            <Link
              key={o.cle}
              href={`/seance/${sessionId}${o.chemin}`}
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
