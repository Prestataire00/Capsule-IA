import Link from 'next/link';
import { ClipboardList, ListChecks, MapPin, MessagesSquare, Users, Video, PenLine } from 'lucide-react';
import { heure, jourRelatif } from '@/features/trainer-space/dates';
import type { MySession } from '@/features/trainer-space/my-sessions';

/**
 * Carte d'une séance du formateur.
 *
 * Toutes les séances se ressemblaient : même cadre gris, même rangée de
 * boutons. Celle du jour porte maintenant sa couleur et sa barre d'accent, et
 * l'heure se lit avant le reste — c'est l'information qu'on cherche quand on
 * ouvre son espace entre deux salles.
 */

type Ton = {
  barre: string;
  carte: string;
  pastille: string;
  bloc: string;
};

const TONS: Record<'aujourdhui' | 'a_venir' | 'en_cours' | 'terminee', Ton> = {
  en_cours: {
    barre: 'bg-amber-500',
    carte: 'border-amber-200 dark:border-amber-900/50 bg-gradient-to-br from-amber-50 to-white dark:from-amber-950/30 dark:to-zinc-900',
    pastille: 'bg-amber-500 text-white',
    bloc: 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-200',
  },
  aujourdhui: {
    barre: 'bg-orange-500',
    carte: 'border-orange-200 dark:border-orange-900/50 bg-gradient-to-br from-orange-50 to-white dark:from-orange-950/30 dark:to-zinc-900',
    pastille: 'bg-orange-500 text-white',
    bloc: 'bg-orange-100 text-orange-800 dark:bg-orange-950/60 dark:text-orange-200',
  },
  a_venir: {
    barre: 'bg-sky-500',
    carte: 'border-zinc-200/70 dark:border-zinc-800 bg-white dark:bg-zinc-900',
    pastille: 'bg-sky-100 text-sky-700 dark:bg-sky-950/60 dark:text-sky-300',
    bloc: 'bg-sky-100 text-sky-800 dark:bg-sky-950/60 dark:text-sky-200',
  },
  terminee: {
    barre: 'bg-emerald-500',
    carte: 'border-zinc-200/70 dark:border-zinc-800 bg-white dark:bg-zinc-900',
    pastille: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300',
    bloc: 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300',
  },
};

const LIBELLE: Record<keyof typeof TONS, string> = {
  en_cours: 'en cours',
  aujourdhui: "aujourd'hui",
  a_venir: 'à venir',
  terminee: 'terminée',
};

const BOUTON =
  'inline-flex items-center gap-1.5 text-[12px] font-medium px-2.5 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 bg-white/70 dark:bg-zinc-900/60 hover:bg-white dark:hover:bg-zinc-800 hover:border-zinc-300 transition';

export function SessionCard({
  s,
  organizationName,
  emphasize = false,
  unread = 0,
}: {
  s: MySession;
  organizationName?: string | null;
  emphasize?: boolean;
  /** Messages non lus du fil de la séance — sinon le formateur ne les verrait jamais. */
  unread?: number;
}) {
  const etat: keyof typeof TONS =
    s.status === 'in_progress' ? 'en_cours' : s.status === 'done' ? 'terminee' : emphasize ? 'aujourdhui' : 'a_venir';
  const t = TONS[etat];

  return (
    <div className={`relative overflow-hidden rounded-xl border shadow-sm ${t.carte}`}>
      <span className={`absolute left-0 top-0 bottom-0 w-1 ${t.barre}`} aria-hidden />

      <div className="pl-4 pr-4 py-3.5 space-y-3">
        <div className="flex items-start gap-3">
          {/* Le créneau, lu avant tout le reste. */}
          <div className={`rounded-lg px-2.5 py-1.5 text-center shrink-0 ${t.bloc}`}>
            <p className="text-[11px] uppercase tracking-wide font-semibold leading-none">{jourRelatif(s.startsAt)}</p>
            <p className="text-[15px] font-extrabold tabular-nums leading-tight mt-1">{heure(s.startsAt)}</p>
            <p className="text-[11px] tabular-nums leading-none opacity-80">{heure(s.endsAt)}</p>
          </div>

          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-semibold text-zinc-900 dark:text-zinc-100 truncate">{s.title}</p>
            <p className="text-[12px] text-zinc-500 dark:text-zinc-400 inline-flex items-center gap-1.5 min-w-0 mt-0.5">
              {s.modality === 'distanciel' ? (
                <Video className="w-3.5 h-3.5 shrink-0 text-blue-500" />
              ) : (
                <MapPin className="w-3.5 h-3.5 shrink-0 text-rose-500" />
              )}
              <span className="truncate">{s.location ?? (s.modality === 'distanciel' ? 'À distance' : 'Lieu à préciser')}</span>
            </p>
            {organizationName && <p className="text-[12px] text-zinc-400 truncate">{organizationName}</p>}
          </div>

          <span className={`text-[11px] font-bold uppercase tracking-wide px-2 h-6 rounded-md grid place-items-center shrink-0 ${t.pastille}`}>
            {LIBELLE[etat]}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {s.remoteUrl && (
            <a
              href={s.remoteUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-[12px] font-semibold px-2.5 py-1.5 rounded-lg text-white bg-blue-500 hover:bg-blue-600 shadow-sm shadow-blue-500/30 transition"
            >
              <Video className="w-3.5 h-3.5" /> Rejoindre la visio
            </a>
          )}
          {unread > 0 && (
            <Link
              href={`/seance/${s.id}/messages`}
              className="inline-flex items-center gap-1.5 text-[12px] font-semibold px-2.5 py-1.5 rounded-lg bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300 hover:bg-emerald-200 dark:hover:bg-emerald-950/70 transition"
            >
              <MessagesSquare className="w-3.5 h-3.5" />
              <span className="tabular-nums">{unread}</span> message{unread > 1 ? 's' : ''}
            </Link>
          )}
          <Link href={`/seance/${s.id}`} className={BOUTON}>
            <Users className="w-3.5 h-3.5 text-rose-500" /> Ma séance
          </Link>
          <Link href={`/seance/${s.id}/fiches-besoin`} className={BOUTON}>
            <ClipboardList className="w-3.5 h-3.5 text-sky-500" /> Fiches besoin
          </Link>
          <Link href={`/seance/${s.id}/questionnaires`} className={BOUTON}>
            <ListChecks className="w-3.5 h-3.5 text-purple-500" /> Questionnaires
          </Link>
          <Link
            href={`/emarger/${s.id}`}
            className="inline-flex items-center gap-1.5 text-[12px] font-semibold px-3 py-1.5 rounded-lg bg-orange-500 hover:bg-orange-600 text-white shadow-sm shadow-orange-500/30 transition ml-auto"
          >
            <PenLine className="w-3.5 h-3.5" /> Émarger
          </Link>
        </div>
      </div>
    </div>
  );
}
