import Link from 'next/link';
import { CalendarDays, CalendarClock, CalendarCheck2, Sun, List, CheckSquare } from 'lucide-react';
import { dayKey, jourLong, mondayKey, semaineDu } from '@/features/trainer-space/dates';
import type { MySession } from '@/features/trainer-space/my-sessions';
import { SessionCard } from '@/features/trainer-space/session-card';

/**
 * Les trois manières de regarder son temps, sous une seule rubrique.
 *
 * « Planning » et « Mes séances » étaient deux entrées qui montraient les mêmes
 * séances — l'une en calendrier, l'autre en liste. C'était deux réponses à une
 * seule question ; elles deviennent trois vues du même écran.
 */

export type Vue = 'liste' | 'calendrier' | 'disponibilites';

export const VUES: ReadonlyArray<{ cle: Vue; label: string; icone: typeof List }> = [
  { cle: 'liste', label: 'À faire', icone: List },
  { cle: 'calendrier', label: 'Calendrier', icone: CalendarDays },
  { cle: 'disponibilites', label: 'Mes disponibilités', icone: CheckSquare },
];

export function estVue(v: unknown): v is Vue {
  return v === 'liste' || v === 'calendrier' || v === 'disponibilites';
}

export function BasculeVue({ active }: { active: Vue }) {
  return (
    <nav className="flex items-center gap-1.5 overflow-x-auto pb-0.5" aria-label="Affichage">
      {VUES.map(({ cle, label, icone: Icone }) => {
        const estActive = cle === active;
        return (
          <Link
            key={cle}
            href={cle === 'liste' ? '/mes-sessions' : `/mes-sessions?vue=${cle}`}
            aria-current={estActive ? 'page' : undefined}
            className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-[13px] whitespace-nowrap transition ${
              estActive
                ? 'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 font-semibold shadow-sm'
                : 'text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800/70'
            }`}
          >
            <Icone className="w-4 h-4" aria-hidden />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

function Section({
  titre,
  icone: Icone,
  ton,
  sessions,
  noms,
  vide,
  emphasize,
  nonLus,
}: {
  titre: string;
  icone: React.ComponentType<{ className?: string }>;
  ton: { texte: string; carre: string };
  sessions: MySession[];
  noms: Map<string, string> | null;
  vide?: string;
  emphasize?: boolean;
  nonLus: Map<string, number>;
}) {
  if (sessions.length === 0 && !vide) return null;
  return (
    <section className="space-y-2.5">
      <h2 className={`text-[13px] font-bold uppercase tracking-[0.06em] flex items-center gap-2 ${ton.texte}`}>
        <span className={`w-6 h-6 rounded-md grid place-items-center ${ton.carre}`}>
          <Icone className="w-3.5 h-3.5" />
        </span>
        {titre} <span className="tabular-nums opacity-70">({sessions.length})</span>
      </h2>
      {sessions.length === 0 ? (
        <p className="text-[13px] text-zinc-400 py-3 pl-8">{vide}</p>
      ) : (
        <ul className="space-y-2.5">
          {sessions.map((s) => (
            <li key={s.id}>
              <SessionCard
                s={s}
                organizationName={noms?.get(s.organizationId) ?? null}
                emphasize={emphasize}
                unread={nonLus.get(s.id) ?? 0}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Ce sur quoi il faut agir : aujourd'hui, la suite, puis ce qui est passé. */
export function VueListe({
  duJour,
  aVenir,
  terminees,
  noms,
  nonLus,
}: {
  duJour: MySession[];
  aVenir: MySession[];
  terminees: MySession[];
  noms: Map<string, string> | null;
  nonLus: Map<string, number>;
}) {
  return (
    <div className="space-y-6">
      <Section
        titre="Aujourd’hui"
        icone={Sun}
        ton={{
          texte: 'text-orange-600 dark:text-orange-400',
          carre: 'bg-orange-100 text-orange-700 dark:bg-orange-950/60 dark:text-orange-300',
        }}
        sessions={duJour}
        noms={noms}
        nonLus={nonLus}
        vide="Aucune séance aujourd’hui."
        emphasize
      />
      <Section
        titre="À venir"
        icone={CalendarClock}
        ton={{
          texte: 'text-sky-600 dark:text-sky-400',
          carre: 'bg-sky-100 text-sky-700 dark:bg-sky-950/60 dark:text-sky-300',
        }}
        sessions={aVenir}
        noms={noms}
        nonLus={nonLus}
        vide="Aucune séance à venir pour l’instant."
      />
      <Section
        titre="Terminées (30 derniers jours)"
        icone={CalendarCheck2}
        ton={{
          texte: 'text-emerald-600 dark:text-emerald-400',
          carre: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300',
        }}
        sessions={terminees}
        noms={noms}
        nonLus={nonLus}
      />
    </div>
  );
}

/** Le même contenu, rangé par semaine puis par jour : « quand suis-je pris ». */
export function VueCalendrier({
  seances,
  lundi,
  noms,
  nonLus,
}: {
  seances: MySession[];
  lundi: string;
  noms: Map<string, string> | null;
  nonLus: Map<string, number>;
}) {
  const semaines = new Map<string, Map<string, MySession[]>>();
  for (const s of seances) {
    const sem = dayKey(s.startsAt) >= lundi ? mondayKey(s.startsAt) : null;
    if (!sem) continue;
    const jour = dayKey(s.startsAt);
    const jours = semaines.get(sem) ?? new Map<string, MySession[]>();
    jours.set(jour, [...(jours.get(jour) ?? []), s]);
    semaines.set(sem, jours);
  }
  const aujourdhui = dayKey(new Date());

  if (semaines.size === 0) {
    return (
      <div className="rounded-xl border border-dashed border-zinc-200 dark:border-zinc-800 px-4 py-12 text-center">
        <span className="mx-auto mb-3 w-12 h-12 rounded-xl grid place-items-center bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300">
          <CalendarDays className="h-6 w-6" />
        </span>
        <p className="text-[13px] text-zinc-400">Aucune séance planifiée sur les neuf prochaines semaines.</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {[...semaines.entries()].map(([sem, jours]) => (
        <section key={sem} className="space-y-3">
          <h2 className="text-[14px] font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
            {semaineDu(sem)}
            {sem === lundi && (
              <span className="text-[11px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-orange-100 text-orange-700 dark:bg-orange-950/60 dark:text-orange-300">
                cette semaine
              </span>
            )}
          </h2>
          {[...jours.entries()].map(([jour, liste]) => (
            <div key={jour} className="space-y-2">
              <p className="text-[12px] font-semibold text-zinc-500 dark:text-zinc-400 capitalize">
                {jourLong(liste[0]!.startsAt)}
              </p>
              <ul className="space-y-2.5">
                {liste.map((s) => (
                  <li key={s.id}>
                    <SessionCard
                      s={s}
                      organizationName={noms?.get(s.organizationId) ?? null}
                      emphasize={jour === aujourdhui}
                      unread={nonLus.get(s.id) ?? 0}
                    />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}