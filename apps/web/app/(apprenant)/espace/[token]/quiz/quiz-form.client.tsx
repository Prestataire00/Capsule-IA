'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Send, Trophy } from 'lucide-react';
import type { QuestionPourApprenant } from '@/features/pedagogie/quiz';
import { repondreAuQuiz } from './actions';

/**
 * Répondre à un quiz. Une seule tentative : on prévient avant l'envoi plutôt
 * que d'expliquer après coup pourquoi la note ne bouge plus.
 */
export function QuizForm({
  token,
  quizId,
  questions,
  bareme,
}: {
  token: string;
  quizId: string;
  questions: QuestionPourApprenant[];
  bareme: number;
}) {
  const router = useRouter();
  const [reponses, setReponses] = useState<Record<string, number[]>>({});
  const [erreur, setErreur] = useState<string | null>(null);
  const [resultat, setResultat] = useState<{ note: number; bareme: number; pourcentage: number } | null>(null);
  const [pending, startTransition] = useTransition();

  const basculer = (questionId: string, index: number) =>
    setReponses((r) => {
      const cochees = r[questionId] ?? [];
      return {
        ...r,
        [questionId]: cochees.includes(index) ? cochees.filter((i) => i !== index) : [...cochees, index],
      };
    });

  const repondues = questions.filter((q) => (reponses[q.id] ?? []).length > 0).length;

  const envoyer = () => {
    setErreur(null);
    const restantes = questions.length - repondues;
    const avertissement =
      restantes > 0
        ? `${restantes} question${restantes > 1 ? 's' : ''} sans réponse. Envoyer quand même ? Vous ne pourrez pas revenir en arrière.`
        : 'Envoyer vos réponses ? Vous ne pourrez pas revenir en arrière.';
    if (!window.confirm(avertissement)) return;

    startTransition(async () => {
      const res = await repondreAuQuiz({ token, quizId, reponses });
      if (!res.ok) return setErreur(res.error);
      setResultat({ note: res.note, bareme: res.bareme, pourcentage: res.pourcentage });
      router.refresh();
    });
  };

  if (resultat) {
    return (
      <div className="rounded-lg border border-emerald-200 dark:border-emerald-900/50 bg-emerald-50 dark:bg-emerald-950/25 px-4 py-3">
        <p className="text-[15px] font-bold text-emerald-800 dark:text-emerald-300 inline-flex items-center gap-2">
          <Trophy className="w-4 h-4" />
          <span className="tabular-nums">
            {resultat.note} / {resultat.bareme}
          </span>
          <span className="font-normal text-[13px]">({resultat.pourcentage} %)</span>
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {questions.map((q, i) => {
        const cochees = reponses[q.id] ?? [];
        return (
          <fieldset key={q.id} className="space-y-1.5">
            <legend className="text-[13px] font-semibold text-zinc-900 dark:text-zinc-100">
              <span className="text-zinc-400 tabular-nums mr-1.5">{i + 1}.</span>
              {q.enonce}
              <span className="ml-2 text-[11px] font-normal text-zinc-500 tabular-nums">
                {q.points} pt{q.points > 1 ? 's' : ''}
              </span>
            </legend>
            {q.choix.map((choix, index) => (
              <label
                key={index}
                className={`flex items-center gap-2.5 px-3 py-2 rounded-lg border cursor-pointer transition ${
                  cochees.includes(index)
                    ? 'border-orange-300 bg-orange-50 dark:border-orange-900/60 dark:bg-orange-950/30'
                    : 'border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800/60'
                }`}
              >
                <input
                  type="checkbox"
                  checked={cochees.includes(index)}
                  onChange={() => basculer(q.id, index)}
                  className="w-4 h-4 rounded border-zinc-300 text-orange-600 focus:ring-orange-500 shrink-0"
                />
                <span className="text-[13px] text-zinc-800 dark:text-zinc-200">{choix}</span>
              </label>
            ))}
          </fieldset>
        );
      })}

      <div className="flex flex-wrap items-center gap-3 pt-1">
        <button
          type="button"
          onClick={envoyer}
          disabled={pending}
          className="h-9 px-4 rounded-lg bg-orange-500 hover:bg-orange-600 text-white text-[13px] font-semibold inline-flex items-center gap-1.5 transition disabled:opacity-60"
        >
          {pending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
          Envoyer mes réponses
        </button>
        <span className="text-[12px] text-zinc-500 dark:text-zinc-400 tabular-nums">
          {repondues} / {questions.length} répondues · {bareme} points
        </span>
      </div>

      {erreur && <p className="text-[12px] text-red-600 dark:text-red-400">{erreur}</p>}
    </div>
  );
}
