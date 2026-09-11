// ARCHETYPE: command
// Justification: vue d'une session — tableau de bord en quatre temps (configuration, gestion,
// espace apprenant, suivi) lu sur l'activité réelle, puis apprenants et émargements.

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Check, Clock, Circle, ArrowUpRight } from 'lucide-react';
import { supabaseServer } from '@/shared/lib/supabase/server';
import { loadSession } from '@/features/sessions/load-session';
import { loadBoardFacts } from '@/features/sessions/load-session-board';
import { buildBoard, type BoardStep } from '@/features/sessions/session-board';

export const dynamic = 'force-dynamic';

const HALF_DAY: Record<string, string> = { morning: 'Matin', afternoon: 'Après-midi', full: 'Journée', evening: 'Soir' };

export default async function SessionOverview({ params }: { params: { id: string } }) {
  const sb = supabaseServer();
  const loaded = await loadSession(sb, params.id);
  if (!loaded) notFound();
  const { learners, sheets } = loaded;
  const base = `/sessions/${params.id}`;
  const board = buildBoard(await loadBoardFacts(sb, loaded), base);

  return (
    <div className="space-y-8">
      <section aria-label="Tableau de bord de la session" className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
        {board.map((col) => {
          const faites = col.steps.filter((s) => s.state === 'fait').length;
          return (
            <div
              key={col.title}
              className="bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-lg shadow-sm p-4"
            >
              <div className="flex items-baseline justify-between mb-3">
                <h2 className="text-[13px] font-medium text-zinc-900 dark:text-zinc-100">{col.title}</h2>
                <span className="text-[11px] text-zinc-500 dark:text-zinc-400 tabular-nums">
                  {faites}/{col.steps.length}
                </span>
              </div>
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
        <h2 className="text-[13px] font-medium text-zinc-700 dark:text-zinc-300 mb-3">Apprenants de la session</h2>
        {learners.length === 0 ? (
          <p className="text-[13px] text-zinc-500 dark:text-zinc-400">Aucun apprenant rattaché à cette session.</p>
        ) : (
          <ul className="bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-lg divide-y divide-zinc-200/60 dark:divide-zinc-800">
            {learners.map((l) => (
              <li key={l.id} className="flex items-center justify-between px-4 py-2.5 text-[13px]">
                <Link href={`/dossiers/${l.dossierId}`} className="text-zinc-800 dark:text-zinc-200 hover:text-violet-600">
                  {l.first_name} {l.last_name}
                </Link>
                <span className="text-[12px] text-zinc-400">{l.email}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="text-[13px] font-medium text-zinc-700 dark:text-zinc-300 mb-3">Émargements</h2>
        {sheets.length === 0 ? (
          <p className="text-[13px] text-zinc-500 dark:text-zinc-400">Aucune feuille d'émargement générée.</p>
        ) : (
          <ul className="bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-lg divide-y divide-zinc-200/60 dark:divide-zinc-800">
            {sheets.map((s) => (
              <li key={s.id} className="flex items-center justify-between px-4 py-2.5 text-[13px]">
                <span className="text-zinc-800 dark:text-zinc-200">{HALF_DAY[s.half_day] ?? s.half_day}</span>
                <span className="text-[12px] text-zinc-500">
                  {s.signed}/{s.total} signés · {s.status}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

const ICONE = { fait: Check, en_cours: Clock, a_faire: Circle } as const;
const TON = {
  fait: 'text-emerald-600 dark:text-emerald-400',
  en_cours: 'text-amber-600 dark:text-amber-400',
  a_faire: 'text-zinc-300 dark:text-zinc-600',
} as const;
const ETAT_LU = { fait: 'fait', en_cours: 'en cours', a_faire: 'à faire' } as const;

function Etape({ step }: { step: BoardStep }) {
  const Icone = ICONE[step.state];
  const contenu = (
    <>
      <Icone className={`w-4 h-4 flex-shrink-0 ${TON[step.state]}`} aria-hidden />
      <span className="flex-1 text-[13px] text-zinc-700 dark:text-zinc-300">
        {step.label}
        <span className="sr-only"> — {ETAT_LU[step.state]}</span>
      </span>
      {step.compte && (
        <span className="text-[11px] text-zinc-500 dark:text-zinc-400 tabular-nums">
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
          className="group flex items-center gap-2 -mx-2 px-2 py-1.5 rounded-md hover:bg-zinc-50 dark:hover:bg-zinc-800/60 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40"
        >
          {contenu}
        </Link>
      ) : (
        <div className="flex items-center gap-2 py-1.5">{contenu}</div>
      )}
    </li>
  );
}
