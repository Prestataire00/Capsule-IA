// ARCHETYPE: workflow
// Justification: l'apprenant répond aux quiz de son formateur, corrigés aussitôt.

import { notFound } from 'next/navigation';
import { ListChecks, Trophy, CheckCircle2 } from 'lucide-react';
import { SectionLabel } from '@/shared/ui/section-label';
import { resolveQuizApprenant } from './_data';
import { QuizForm } from './quiz-form.client';

export const dynamic = 'force-dynamic';

const dateFmt = new Intl.DateTimeFormat('fr-FR', {
  timeZone: 'Europe/Paris',
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
});

export default async function EspaceQuizPage({ params }: { params: { token: string } }) {
  const contexte = await resolveQuizApprenant(params.token);
  if (!contexte) notFound();

  const { quiz } = contexte;
  const faits = quiz.filter((q) => q.resultat !== null).length;

  return (
    <div className="space-y-6">
      <header>
        <SectionLabel className="mb-2">Ma formation</SectionLabel>
        <h1 className="text-[26px] leading-none font-semibold text-zinc-900 dark:text-zinc-100">Quiz</h1>
        <p className="text-[13px] text-zinc-500 dark:text-zinc-400 mt-3">
          {quiz.length === 0
            ? 'Aucun quiz pour l’instant.'
            : `${faits} / ${quiz.length} quiz complété${faits > 1 ? 's' : ''}. Votre note s’affiche dès l’envoi.`}
        </p>
      </header>

      {quiz.length === 0 ? (
        <div className="rounded-xl border border-zinc-200/70 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-4 py-12 text-center">
          <span className="mx-auto mb-3 w-12 h-12 rounded-xl grid place-items-center bg-purple-100 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300">
            <ListChecks className="h-6 w-6" />
          </span>
          <p className="text-[13px] text-zinc-400">Votre formateur n’a pas encore publié de quiz.</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {quiz.map((q) => (
            <li
              key={q.id}
              className="rounded-xl border border-zinc-200/70 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden"
            >
              <div className="px-4 py-3 border-b border-zinc-100 dark:border-zinc-800 flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <p className="text-[14px] font-bold text-zinc-900 dark:text-zinc-100">{q.title}</p>
                  <p className="text-[12px] text-zinc-500 dark:text-zinc-400 tabular-nums">
                    {q.questions.length} question{q.questions.length > 1 ? 's' : ''} · {q.bareme} points
                    {q.passScore !== null && ` · réussite à ${q.passScore} %`}
                    {q.dueAt && ` · avant le ${dateFmt.format(new Date(q.dueAt))}`}
                  </p>
                  {q.instructions && (
                    <p className="text-[13px] text-zinc-600 dark:text-zinc-400 mt-1.5 whitespace-pre-wrap">
                      {q.instructions}
                    </p>
                  )}
                </div>
                {q.resultat && (
                  <span className="inline-flex items-center gap-1.5 text-[12px] font-bold px-2.5 h-7 rounded-md bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 shrink-0 tabular-nums">
                    <Trophy className="w-3.5 h-3.5" />
                    {q.resultat.note}
                    {q.resultat.max !== null ? ` / ${q.resultat.max}` : ''}
                    {q.resultat.pourcentage !== null ? ` · ${q.resultat.pourcentage} %` : ''}
                  </span>
                )}
              </div>

              <div className="px-4 py-3">
                {q.resultat ? (
                  <p className="text-[13px] text-zinc-500 dark:text-zinc-400 inline-flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                    Répondu le <span className="tabular-nums">{dateFmt.format(new Date(q.resultat.passeLe))}</span>.
                  </p>
                ) : (
                  <QuizForm token={params.token} quizId={q.id} questions={q.questions} bareme={q.bareme} />
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
