// ARCHETYPE: command
import { notFound } from 'next/navigation';
import { PenLine, CheckCircle2, CircleDashed, Award, Clock, FileText } from 'lucide-react';
import { resolveApprenantContext } from '../_lib';
import { resolveApprenantExercises } from '../exercises';
import { StatusPill } from '@/shared/ui/status-pill';
import { SectionLabel } from '@/shared/ui/section-label';

export const dynamic = 'force-dynamic';

export default async function EspaceExercicesPage({ params }: { params: { token: string } }) {
  const ctx = await resolveApprenantContext(params.token);
  if (!ctx) return notFound();

  const exercises = await resolveApprenantExercises(params.token);
  const submitted = exercises.filter((e) => e.submission !== null).length;
  const total = exercises.length;

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
      <header className="mb-7 rounded-2xl border border-orange-100 dark:border-orange-900/40 bg-gradient-to-br from-orange-50 via-amber-50 to-rose-50 dark:from-orange-950/40 dark:via-zinc-900 dark:to-rose-950/30 px-6 py-5 flex items-center gap-4">
        <span className="w-12 h-12 rounded-2xl grid place-items-center text-white shadow-md shrink-0 bg-amber-500 shadow-amber-500/30">
          <PenLine className="w-6 h-6" />
        </span>
        <div className="min-w-0">
          <SectionLabel className="mb-2">Espace apprenant</SectionLabel>
          <h1 className="text-[30px] leading-none font-extrabold text-zinc-900 dark:text-zinc-100">Exercices & devoirs</h1>
          <p className="text-[13px] text-zinc-600 dark:text-zinc-400 mt-3 tabular-nums">
            {submitted}/{total} rendu{submitted > 1 ? 's' : ''} sur l&apos;ensemble du parcours.
          </p>
        </div>
      </header>

      {exercises.length === 0 ? (
        <div className="bg-white dark:bg-zinc-900 border border-dashed border-zinc-200/60 dark:border-zinc-800 rounded-xl shadow-sm p-12 text-center">
          <span className="w-12 h-12 rounded-2xl grid place-items-center mx-auto mb-3 bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300">
            <PenLine className="w-6 h-6" />
          </span>
          <p className="text-[13px] text-zinc-500 dark:text-zinc-400">Aucun exercice pour l&apos;instant.</p>
        </div>
      ) : (
        <section className="space-y-3">
          {exercises.map((ex) => {
            const isGraded = ex.submission?.status === 'graded';
            const isSubmitted = ex.submission?.status === 'submitted';

            const pillTone = isGraded ? 'success' : isSubmitted ? 'info' : 'warning';
            const pillLabel = isGraded ? 'Corrigé' : isSubmitted ? 'Rendu' : 'À faire';

            const Icon = isGraded ? Award : isSubmitted ? CheckCircle2 : CircleDashed;
            const iconTone = isGraded
              ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300'
              : isSubmitted
              ? 'bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300'
              : 'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300';

            return (
              <article
                key={ex.id}
                className="bg-white dark:bg-zinc-900 border border-zinc-200/70 dark:border-zinc-800 rounded-xl shadow-sm p-5"
              >
                {/* Header exercice */}
                <div className="flex items-start gap-3 mb-3">
                  <span className={`w-9 h-9 rounded-xl grid place-items-center flex-shrink-0 ${iconTone}`}>
                    <Icon className="w-4 h-4" />
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-[15px] font-bold text-zinc-900 dark:text-zinc-100">{ex.title}</p>
                      <StatusPill tone={pillTone}>{pillLabel}</StatusPill>
                    </div>
                    {ex.dueAt && (
                      <p className="text-[12px] text-zinc-500 dark:text-zinc-400 mt-0.5 flex items-center gap-1 tabular-nums">
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
                      className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-orange-600 dark:text-orange-400 hover:underline"
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
                        Note : <span className="font-extrabold tabular-nums text-emerald-700 dark:text-emerald-400">{ex.submission.grade}</span>
                      </p>
                    )}
                    {ex.submission.feedback && (
                      <div className="bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-100 dark:border-emerald-900/40 rounded-lg px-3 py-2">
                        <p className="text-[11px] font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-[0.06em] mb-1">Retour du formateur</p>
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
                        className="w-full text-[13px] px-3 py-2 rounded-lg border border-zinc-200/80 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-600 focus:outline-none focus:border-orange-300 dark:focus:border-orange-800 focus:ring-4 focus:ring-orange-500/10 transition resize-none"
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
                          className="inline-flex items-center gap-1.5 px-3.5 h-9 rounded-lg bg-orange-500 hover:bg-orange-600 text-white text-[13px] font-semibold shadow-sm shadow-orange-600/30 ring-1 ring-inset ring-white/10 transition"
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
