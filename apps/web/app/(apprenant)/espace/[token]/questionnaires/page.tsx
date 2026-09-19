// ARCHETYPE: command
// Justification: liste des questionnaires assignés à l'apprenant (à remplir + complétés).

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ClipboardList, CheckCircle2, ChevronRight, Clock } from 'lucide-react';
import { SectionLabel } from '@/shared/ui/section-label';
import { resolveApprenantContext } from '../_lib';
import { listApprenantQuestionnaires, QUESTIONNAIRE_KIND_LABEL } from '../questionnaires';

export const dynamic = 'force-dynamic';

export default async function EspaceQuestionnairesPage({
  params,
  searchParams,
}: {
  params: { token: string };
  searchParams: { done?: string };
}) {
  const [ctx, questionnaires] = await Promise.all([
    resolveApprenantContext(params.token),
    listApprenantQuestionnaires(params.token),
  ]);
  if (!ctx) return notFound();

  const todo = questionnaires.filter((q) => q.status !== 'completed' && q.status !== 'expired');
  const done = questionnaires.filter((q) => q.status === 'completed');

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
      <header className="mb-7 rounded-2xl border border-orange-100 dark:border-orange-900/40 bg-gradient-to-br from-orange-50 via-amber-50 to-rose-50 dark:from-orange-950/40 dark:via-zinc-900 dark:to-rose-950/30 px-6 py-5 flex items-center gap-4">
        <span className="w-12 h-12 rounded-2xl grid place-items-center text-white shadow-md shrink-0 bg-purple-500 shadow-purple-500/30">
          <ClipboardList className="w-6 h-6" />
        </span>
        <div className="min-w-0">
          <SectionLabel className="mb-2">Espace apprenant</SectionLabel>
          <h1 className="text-[30px] leading-none font-extrabold text-zinc-900 dark:text-zinc-100">Questionnaires</h1>
          <p className="text-[13px] text-zinc-600 dark:text-zinc-400 mt-3 tabular-nums">
            {todo.length === 0 ? 'Tout est à jour, merci !' : `${todo.length} questionnaire${todo.length > 1 ? 's' : ''} à compléter.`}
          </p>
        </div>
      </header>

      {searchParams.done && (
        <div className="bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200/60 dark:border-emerald-900/40 text-emerald-800 dark:text-emerald-200 rounded-xl px-4 py-3 text-[13px] mb-6 inline-flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          {searchParams.done === 'already' ? 'Vous aviez déjà répondu à ce questionnaire.' : 'Merci, vos réponses ont bien été enregistrées.'}
        </div>
      )}

      {questionnaires.length === 0 ? (
        <section className="bg-white dark:bg-zinc-900 border border-zinc-200/70 dark:border-zinc-800 rounded-xl shadow-sm p-10 text-center">
          <span className="w-12 h-12 rounded-2xl grid place-items-center mx-auto mb-3 bg-purple-100 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300">
            <ClipboardList className="w-6 h-6" />
          </span>
          <p className="text-[13px] text-zinc-500 dark:text-zinc-400">Aucun questionnaire ne vous est demandé pour le moment.</p>
        </section>
      ) : (
        <div className="space-y-6">
          {todo.length > 0 && (
            <section>
              <p className="text-[11px] font-bold uppercase tracking-[0.06em] text-zinc-500 dark:text-zinc-400 mb-2">À compléter</p>
              <ul className="space-y-2">
                {todo.map((q) => (
                  <li key={q.assignmentId}>
                    <Link
                      href={`/espace/${params.token}/questionnaires/${q.assignmentId}`}
                      className="group bg-white dark:bg-zinc-900 border border-zinc-200/70 dark:border-zinc-800 rounded-xl p-4 shadow-sm hover:shadow-md hover:border-orange-200 dark:hover:border-orange-900/60 transition flex items-center gap-4"
                    >
                      <span className="w-10 h-10 rounded-xl grid place-items-center flex-shrink-0 bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300">
                        <ClipboardList className="w-5 h-5" />
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-[15px] font-bold text-zinc-900 dark:text-zinc-100 truncate">{q.title}</p>
                        <p className="text-[12px] text-zinc-500 dark:text-zinc-400 mt-0.5 inline-flex items-center gap-1.5 tabular-nums">
                          {QUESTIONNAIRE_KIND_LABEL[q.kind] ?? 'Questionnaire'}
                          {q.dueAt && (
                            <>
                              <span className="text-zinc-300 dark:text-zinc-700">·</span>
                              <span className="inline-flex items-center gap-1">
                                <Clock className="w-3 h-3" /> avant le {new Date(q.dueAt).toLocaleDateString('fr-FR')}
                              </span>
                            </>
                          )}
                        </p>
                      </div>
                      <ChevronRight className="w-4 h-4 text-zinc-300 dark:text-zinc-700 group-hover:text-orange-500 transition flex-shrink-0" />
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {done.length > 0 && (
            <section>
              <p className="text-[11px] font-bold uppercase tracking-[0.06em] text-zinc-500 dark:text-zinc-400 mb-2">Complétés</p>
              <ul className="space-y-2">
                {done.map((q) => (
                  <li
                    key={q.assignmentId}
                    className="bg-white dark:bg-zinc-900 border border-zinc-200/70 dark:border-zinc-800 rounded-xl p-4 shadow-sm flex items-center gap-4 opacity-80"
                  >
                    <span className="w-10 h-10 rounded-xl grid place-items-center flex-shrink-0 bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
                      <CheckCircle2 className="w-5 h-5" />
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-[15px] font-bold text-zinc-900 dark:text-zinc-100 truncate">{q.title}</p>
                      <p className="text-[12px] text-zinc-500 dark:text-zinc-400 mt-0.5">{QUESTIONNAIRE_KIND_LABEL[q.kind] ?? 'Questionnaire'} · complété</p>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
