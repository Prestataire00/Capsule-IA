// ARCHETYPE: workflow (mobile)
// Justification: le stagiaire fait un quiz ou un exercice dont le lien lui a
// été transmis par son entreprise — une page seule, sans espace.

import { notFound } from 'next/navigation';
import { CheckCircle2, Trophy } from 'lucide-react';
import { FORME_LABELS } from '@/features/pedagogie/kinds';
import { resolveQuizApprenant } from '@/app/(apprenant)/espace/[token]/quiz/_data';
import { QuizForm } from '@/app/(apprenant)/espace/[token]/quiz/quiz-form.client';
import { CartesMemoire, TexteATrouForm, VideoExercice } from '@/app/(apprenant)/espace/[token]/quiz/formes.client';

export const dynamic = 'force-dynamic';

export default async function QuizStagiairePage({ params }: { params: { token: string; exerciseId: string } }) {
  const contexte = await resolveQuizApprenant(params.token);
  const q = contexte?.quiz.find((x) => x.id === params.exerciseId);
  if (!q) notFound();

  return (
    <main className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        <div className="rounded-xl border border-zinc-200/70 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden shadow-sm">
          <div className="px-4 py-3 border-b border-zinc-100 dark:border-zinc-800 flex items-start justify-between gap-3 flex-wrap">
            <div className="min-w-0">
              <h1 className="text-[18px] font-semibold text-zinc-900 dark:text-zinc-100">
                {q.title}
                <span className="ml-2 text-[11px] font-medium uppercase tracking-wide px-1.5 py-0.5 rounded bg-purple-100 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300">
                  {FORME_LABELS[q.kind]}
                </span>
              </h1>
              {q.instructions && <p className="text-[13px] text-zinc-600 dark:text-zinc-400 mt-1.5 whitespace-pre-wrap">{q.instructions}</p>}
            </div>
            {q.resultat && (
              <span className="inline-flex items-center gap-1.5 text-[12px] font-medium px-2.5 h-7 rounded-md bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 tabular-nums">
                <Trophy className="w-3.5 h-3.5" />
                {q.resultat.note}
                {q.resultat.max !== null ? ` / ${q.resultat.max}` : ''}
              </span>
            )}
          </div>
          <div className="px-4 py-4">
            {q.kind === 'cartes_memoire' ? (
              <CartesMemoire cartes={q.contenu.cartes ?? []} />
            ) : q.resultat ? (
              <p className="text-[13px] text-zinc-600 dark:text-zinc-400 inline-flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-500" /> C’est fait, merci.
              </p>
            ) : q.kind === 'texte_a_trou' ? (
              <TexteATrouForm token={params.token} quizId={q.id} segments={q.segments} nbTrous={q.nbTrous} />
            ) : q.kind === 'video' ? (
              <div className="space-y-3">
                {q.contenu.url && <VideoExercice url={q.contenu.url} />}
                {q.questions.length > 0 && <QuizForm token={params.token} quizId={q.id} questions={q.questions} bareme={q.bareme} />}
              </div>
            ) : (
              <QuizForm token={params.token} quizId={q.id} questions={q.questions} bareme={q.bareme} />
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
