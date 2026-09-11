// ARCHETYPE: command
// Justification: vue d'une session — tableau de bord en quatre temps (configuration, gestion,
// espace apprenant, suivi) lu sur l'activité réelle, puis apprenants et émargements.

import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { ComponentType } from 'react';
import { Check, Clock, ArrowUpRight, Settings2, FolderKanban, UserRound, TrendingUp, Sun, Sunset, CalendarDays, Moon } from 'lucide-react';
import { supabaseServer } from '@/shared/lib/supabase/server';
import { StatusPill } from '@/shared/ui/status-pill';
import { ACCENTS, AccentBar, type Accent } from '@/shared/ui/kpi-card';
import { loadSession } from '@/features/sessions/load-session';
import { loadBoardFacts } from '@/features/sessions/load-session-board';
import { buildBoard, type BoardStep } from '@/features/sessions/session-board';

export const dynamic = 'force-dynamic';

const HALF_DAY: Record<string, { label: string; icon: ComponentType<{ className?: string }>; accent: Accent }> = {
  morning: { label: 'Matin', icon: Sun, accent: 'amber' },
  afternoon: { label: 'Après-midi', icon: Sunset, accent: 'orange' },
  full: { label: 'Journée', icon: CalendarDays, accent: 'blue' },
  evening: { label: 'Soir', icon: Moon, accent: 'purple' },
};
const SHEET_STATUS: Record<string, { label: string; tone: 'success' | 'warning' | 'info' | 'neutral' }> = {
  finalized: { label: 'Finalisée', tone: 'success' },
  open: { label: 'Ouverte', tone: 'warning' },
  draft: { label: 'Brouillon', tone: 'neutral' },
};

// Chaque temps de la session a sa couleur : on repère d'un coup d'œil où l'on en est.
const COLUMN_STYLE: { accent: Accent; icon: ComponentType<{ className?: string }> }[] = [
  { accent: 'blue', icon: Settings2 },
  { accent: 'orange', icon: FolderKanban },
  { accent: 'rose', icon: UserRound },
  { accent: 'emerald', icon: TrendingUp },
];

const AVATARS = [
  'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300',
  'bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300',
  'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300',
  'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300',
  'bg-purple-100 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300',
];

const LIST = 'bg-white dark:bg-zinc-900 border border-zinc-200/70 dark:border-zinc-800 rounded-xl shadow-sm divide-y divide-zinc-100 dark:divide-zinc-800/80 overflow-hidden';

export default async function SessionOverview({ params }: { params: { id: string } }) {
  const sb = supabaseServer();
  const loaded = await loadSession(sb, params.id);
  if (!loaded) notFound();
  const { learners, sheets } = loaded;
  const base = `/sessions/${params.id}`;
  const board = buildBoard(await loadBoardFacts(sb, loaded), base);

  return (
    <div className="space-y-8">
      <section aria-label="Tableau de bord de la session" className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {board.map((col, i) => {
          const faites = col.steps.filter((s) => s.state === 'fait').length;
          const style = COLUMN_STYLE[i % COLUMN_STYLE.length] ?? { accent: 'orange' as const, icon: Settings2 };
          const a = ACCENTS[style.accent];
          const Icon = style.icon;
          return (
            <div key={col.title} className={`rounded-xl border bg-gradient-to-br shadow-sm p-4 ${a.card}`}>
              <div className="flex items-center gap-2.5 mb-3">
                <span className={`w-8 h-8 rounded-lg grid place-items-center text-white shadow-md shrink-0 ${a.chip}`}>
                  <Icon className="w-4 h-4" />
                </span>
                <h2 className="flex-1 text-[14px] font-extrabold text-zinc-900 dark:text-zinc-100">{col.title}</h2>
                <span className={`text-[12px] font-bold tabular-nums px-2 py-0.5 rounded-full ${a.soft}`}>
                  {faites}/{col.steps.length}
                </span>
              </div>
              <AccentBar value={faites} max={col.steps.length} accent={style.accent} className="mb-3" />
              <ul className="space-y-1">
                {col.steps.map((s) => (
                  <Etape key={s.key} step={s} />
                ))}
              </ul>
            </div>
          );
        })}
      </section>

      <section>
        <h2 className="text-[15px] font-extrabold text-zinc-900 dark:text-zinc-100 mb-3 flex items-center gap-2">
          Apprenants de la session
          <span className={`text-[12px] font-bold tabular-nums px-2 py-0.5 rounded-full ${ACCENTS.rose.soft}`}>{learners.length}</span>
        </h2>
        {learners.length === 0 ? (
          <p className="text-[13px] text-zinc-500 dark:text-zinc-400">Aucun apprenant rattaché à cette session.</p>
        ) : (
          <ul className={LIST}>
            {learners.map((l) => {
              const name = `${l.first_name ?? ''} ${l.last_name ?? ''}`.trim();
              const initials = name.split(' ').map((p) => p[0]).join('').slice(0, 2).toUpperCase();
              const palette = AVATARS[(name.charCodeAt(0) || 0) % AVATARS.length];
              return (
                <li key={l.id} className="flex items-center gap-3 px-5 py-3 text-[13px] hover:bg-rose-50/40 dark:hover:bg-zinc-800/30 transition-colors">
                  <span className={`w-8 h-8 rounded-full grid place-items-center text-[11px] font-bold shrink-0 ${palette}`}>{initials}</span>
                  <Link href={`/dossiers/${l.dossierId}`} className="font-bold text-zinc-900 dark:text-zinc-100 hover:text-orange-600 dark:hover:text-orange-300 truncate">
                    {name}
                  </Link>
                  <span className="ml-auto text-[12px] text-zinc-500 dark:text-zinc-400 truncate">{l.email}</span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section>
        <h2 className="text-[15px] font-extrabold text-zinc-900 dark:text-zinc-100 mb-3 flex items-center gap-2">
          Émargements
          <span className={`text-[12px] font-bold tabular-nums px-2 py-0.5 rounded-full ${ACCENTS.emerald.soft}`}>{sheets.length}</span>
        </h2>
        {sheets.length === 0 ? (
          <p className="text-[13px] text-zinc-500 dark:text-zinc-400">Aucune feuille d'émargement générée.</p>
        ) : (
          <ul className={LIST}>
            {sheets.map((s) => {
              const half = HALF_DAY[s.half_day] ?? { label: s.half_day, icon: CalendarDays, accent: 'blue' as const };
              const HalfIcon = half.icon;
              const st = SHEET_STATUS[s.status] ?? { label: s.status, tone: 'neutral' as const };
              const complete = s.total > 0 && s.signed >= s.total;
              return (
                <li key={s.id} className="grid grid-cols-[minmax(0,1fr)_minmax(0,220px)_auto] items-center gap-4 px-5 py-3.5 text-[13px]">
                  <span className="flex items-center gap-2.5 min-w-0">
                    <span className={`w-8 h-8 rounded-lg grid place-items-center shrink-0 ${ACCENTS[half.accent].soft}`}>
                      <HalfIcon className="w-4 h-4" />
                    </span>
                    <span className="font-bold text-zinc-900 dark:text-zinc-100 truncate">{half.label}</span>
                  </span>
                  <span className="flex items-center gap-3">
                    <AccentBar value={s.signed} max={s.total} accent={complete ? 'emerald' : 'amber'} />
                    <span className="text-[12px] font-semibold text-zinc-600 dark:text-zinc-400 tabular-nums whitespace-nowrap">
                      {s.signed}/{s.total} signés
                    </span>
                  </span>
                  <StatusPill tone={st.tone}>{st.label}</StatusPill>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

const ETAT_LU = { fait: 'fait', en_cours: 'en cours', a_faire: 'à faire' } as const;

function Pastille({ state }: { state: BoardStep['state'] }) {
  if (state === 'fait') {
    return (
      <span className="w-5 h-5 rounded-full grid place-items-center bg-emerald-500 text-white shrink-0" aria-hidden>
        <Check className="w-3 h-3" strokeWidth={3} />
      </span>
    );
  }
  if (state === 'en_cours') {
    return (
      <span className="w-5 h-5 rounded-full grid place-items-center bg-amber-400 text-white shrink-0" aria-hidden>
        <Clock className="w-3 h-3" strokeWidth={2.5} />
      </span>
    );
  }
  return <span className="w-5 h-5 rounded-full border-2 border-zinc-300 dark:border-zinc-600 bg-white/70 dark:bg-zinc-900 shrink-0" aria-hidden />;
}

function Etape({ step }: { step: BoardStep }) {
  const done = step.state === 'fait';
  const contenu = (
    <>
      <Pastille state={step.state} />
      <span className={`flex-1 text-[13px] ${done ? 'font-semibold text-zinc-900 dark:text-zinc-100' : 'text-zinc-700 dark:text-zinc-300'}`}>
        {step.label}
        <span className="sr-only"> — {ETAT_LU[step.state]}</span>
      </span>
      {step.compte && (
        <span className="text-[12px] font-semibold text-zinc-500 dark:text-zinc-400 tabular-nums">
          {step.total === 0 ? '—' : `${step.done}/${step.total}`}
        </span>
      )}
      {step.href && <ArrowUpRight className="w-3 h-3 text-zinc-400 opacity-0 group-hover:opacity-100 transition" aria-hidden />}
    </>
  );
  return (
    <li>
      {step.href ? (
        <Link
          href={step.href}
          className="group flex items-center gap-2.5 -mx-2 px-2 py-1.5 rounded-md hover:bg-white/70 dark:hover:bg-zinc-800/50 transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-orange-500/20"
        >
          {contenu}
        </Link>
      ) : (
        <div className="flex items-center gap-2.5 py-1.5">{contenu}</div>
      )}
    </li>
  );
}
