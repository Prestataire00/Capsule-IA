// ARCHETYPE: command
// Justification: liste des questionnaires assignés à l'apprenant (à remplir + complétés).

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ClipboardList, CheckCircle2, ChevronRight, Clock } from 'lucide-react';
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
    <div className="max-w-3xl mx-auto px-8 py-8">
      <header className="mb-6 flex items-center gap-3">
        <span className="w-11 h-11 rounded-xl bg-gradient-to-br from-violet-100 to-violet-50 dark:from-violet-950/60 dark:to-violet-950/30 text-violet-700 dark:text-violet-300 flex items-center justify-center shadow-sm">
          <ClipboardList className="w-5 h-5" />
        </span>
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100 tracking-tight">Questionnaires</h1>
          <p className="text-[13px] text-zinc-500 dark:text-zinc-400 mt-0.5">
            {todo.length === 0 ? 'Tout est à jour, merci !' : `${todo.length} questionnaire${todo.length > 1 ? 's' : ''} à compléter.`}
          </p>
        </div>
      </header>

      {searchParams.done && (
        <div className="bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200/60 dark:border-emerald-900/40 text-emerald-800 dark:text-emerald-200 rounded-lg px-4 py-3 text-[13px] mb-6 inline-flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          {searchParams.done === 'already' ? 'Vous aviez déjà répondu à ce questionnaire.' : 'Merci, vos réponses ont bien été enregistrées.'}
        </div>
      )}

      {questionnaires.length === 0 ? (
        <section className="bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-xl shadow-sm p-10 text-center">
          <ClipboardList className="w-10 h-10 text-zinc-300 dark:text-zinc-700 mx-auto mb-3" />
          <p className="text-[13px] text-zinc-500 dark:text-zinc-400">Aucun questionnaire ne vous est demandé pour le moment.</p>
        </section>
      ) : (
        <div className="space-y-6">
          {todo.length > 0 && (
            <section>
              <p className="text-[11px] uppercase tracking-wider text-zinc-500 dark:text-zinc-400 font-medium mb-2">À compléter</p>
              <ul className="space-y-2">
                {todo.map((q) => (
                  <li key={q.assignmentId}>
                    <Link
                      href={`/espace/${params.token}/questionnaires/${q.assignmentId}`}
                      className="group bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-xl p-4 shadow-sm hover:shadow-md hover:border-violet-200 dark:hover:border-violet-900/60 transition flex items-center gap-4"
                    >
                      <span className="w-10 h-10 rounded-lg bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 flex items-center justify-center flex-shrink-0">
                        <ClipboardList className="w-4 h-4" />
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-[14px] font-semibold text-zinc-900 dark:text-zinc-100 truncate">{q.title}</p>
                        <p className="text-[12px] text-zinc-500 dark:text-zinc-400 mt-0.5 inline-flex items-center gap-1.5">
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
                      <ChevronRight className="w-4 h-4 text-zinc-300 dark:text-zinc-700 group-hover:text-violet-600 transition flex-shrink-0" />
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {done.length > 0 && (
            <section>
              <p className="text-[11px] uppercase tracking-wider text-zinc-500 dark:text-zinc-400 font-medium mb-2">Complétés</p>
              <ul className="space-y-2">
                {done.map((q) => (
                  <li
                    key={q.assignmentId}
                    className="bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-xl p-4 shadow-sm flex items-center gap-4 opacity-80"
                  >
                    <span className="w-10 h-10 rounded-lg bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 flex items-center justify-center flex-shrink-0">
                      <CheckCircle2 className="w-4 h-4" />
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-[14px] font-medium text-zinc-900 dark:text-zinc-100 truncate">{q.title}</p>
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
