// ARCHETYPE: command
import { notFound } from 'next/navigation';
import { PenLine, CheckCircle2, CircleDashed, Award, Clock, FileText } from 'lucide-react';
import { resolveApprenantContext } from '../_lib';
import { resolveApprenantExercises } from '../exercises';
import { StatusPill } from '@/shared/ui/status-pill';

export const dynamic = 'force-dynamic';

export default async function EspaceExercicesPage({ params }: { params: { token: string } }) {
  const ctx = await resolveApprenantContext(params.token);
  if (!ctx) return notFound();

  const exercises = await resolveApprenantExercises(params.token);
  const submitted = exercises.filter((e) => e.submission !== null).length;
  const total = exercises.length;

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
      <header className="mb-6 flex items-center gap-3">
        <span className="w-11 h-11 rounded-xl bg-gradient-to-br from-amber-100 to-amber-50 dark:from-amber-950/60 dark:to-amber-950/30 text-amber-700 dark:text-amber-300 flex items-center justify-center shadow-sm">
          <PenLine className="w-5 h-5" />
        </span>
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100 tracking-tight">Exercices & devoirs</h1>
          <p className="text-[13px] text-zinc-500 dark:text-zinc-400 mt-0.5">
            {submitted}/{total} rendu{submitted > 1 ? 's' : ''} sur l&apos;ensemble du parcours.
          </p>
        </div>
      </header>

      {exercises.length === 0 ? (
        <div className="bg-white dark:bg-zinc-900 border border-dashed border-zinc-200/60 dark:border-zinc-800 rounded-xl shadow-sm p-12 text-center">
          <PenLine className="w-8 h-8 text-zinc-300 dark:text-zinc-600 mx-auto mb-3" />
          <p className="text-[13px] text-zinc-500 dark:text-zinc-400">Aucun exercice pour l&apos;instant.</p>
        </div>
      ) : (
        <section className="space-y-3">
          {exercises.map((ex) => {
            const isGraded = ex.submission?.status === 'graded';
            const isSubmitted = ex.submission?.status === 'submitted';
            const isPending = !ex.submission;

            const pillTone = isGraded ? 'success' : isSubmitted ? 'info' : 'warning';
            const pillLabel = isGraded ? 'Corrigé' : isSubmitted ? 'Rendu' : 'À faire';

            const Icon = isGraded ? Award : isSubmitted ? CheckCircle2 : CircleDashed;
            const iconTone = isGraded
              ? 'bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300'
              : isSubmitted
              ? 'bg-blue-100 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300'
              : 'bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300';

            return (
              <article
                key={ex.id}
                className="bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-xl shadow-sm p-5"
              >
                {/* Header exercice */}
                <div className="flex items-start gap-3 mb-3">
                  <span className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 shadow-sm ${iconTone}`}>
                    <Icon className="w-4 h-4" />
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-[14px] font-medium text-zinc-900 dark:text-zinc-100">{ex.title}</p>
                      <StatusPill tone={pillTone}>{pillLabel}</StatusPill>
                    </div>
                    {ex.dueAt && (
                      <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5 flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        À rendre avant le {new Date(ex.dueAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}
                      </p>
                    )}
                  </div>
                </div>

                {/* Instructions */}
                {ex.instructions && (
                  <div className="mb-3 pl-12">
                    <p className="text-[12px] text-zinc-500 dark:text-zinc-400 whitespace-pre-line">{ex.instructions}</p>
                  </div>
                )}

                {/* Énoncé joint */}
                {ex.hasAttachment && (
                  <div className="mb-3 pl-12">
                    <a
                      href={`/api/espace/${params.token}/exercise/${ex.id}/attachment`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-[12px] text-blue-600 dark:text-blue-400 hover:underline"
                    >
                      <FileText className="w-3.5 h-3.5" />
                      Télécharger l&apos;énoncé
                    </a>
                  </div>
                )}

                {/* Résultat si corrigé */}
                {isGraded && ex.submission && (
                  <div className="mb-3 pl-12 space-y-1.5">
                    {ex.submission.grade !== null && (
                      <p className="text-[13px] text-zinc-900 dark:text-zinc-100">
                        Note : <span className="font-medium text-emerald-700 dark:text-emerald-400">{ex.submission.grade}</span>
                      </p>
                    )}
                    {ex.submission.feedback && (
                      <div className="bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-100 dark:border-emerald-900/40 rounded-lg px-3 py-2">
                        <p className="text-[11px] text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-1">Retour du formateur</p>
                        <p className="text-[13px] text-zinc-700 dark:text-zinc-300 whitespace-pre-line">{ex.submission.feedback}</p>
                      </div>
                    )}
                  </div>
                )}

                {/* Formulaire de soumission (uniquement si non corrigé) */}
                {!isGraded && (
                  <div className="pl-12">
                    <form
                      method="post"
                      action={`/api/espace/${params.token}/exercise/${ex.id}/submit`}
                      encType="multipart/form-data"
                      className="space-y-2"
                    >
                      <textarea
                        name="content"
                        placeholder={isSubmitted ? 'Modifier votre réponse écrite (optionnel)…' : 'Réponse écrite (optionnel)…'}
                        rows={3}
                        className="w-full text-[13px] px-3 py-2 rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-amber-400 shadow-sm resize-none"
                      />
                      <div className="flex items-center gap-3 flex-wrap">
                        <input
                          type="file"
                          name="file"
                          accept=".pdf,.docx,.xlsx,.pptx,.png,.jpg,.jpeg,.zip"
                          className="text-[12px] text-zinc-600 dark:text-zinc-400 file:mr-3 file:py-1 file:px-3 file:rounded-md file:border-0 file:text-[12px] file:bg-zinc-100 dark:file:bg-zinc-800 file:text-zinc-700 dark:file:text-zinc-300 file:cursor-pointer hover:file:bg-zinc-200 dark:hover:file:bg-zinc-700 transition"
                        />
                        <button
                          type="submit"
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-orange-500 hover:bg-orange-600 text-white text-[12px] font-medium shadow-sm transition"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          {isSubmitted ? 'Resoumettre' : 'Remettre'}
                        </button>
                      </div>
                    </form>
                  </div>
                )}
              </article>
            );
          })}
        </section>
      )}
    </div>
  );
}
