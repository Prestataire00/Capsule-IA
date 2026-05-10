// ARCHETYPE: workflow
// Justification: questionnaire apprenant — 1 question à la fois ou liste centrée, focus extrême.

'use client';

import { useState } from 'react';
import { Check, ArrowRight } from 'lucide-react';

const questions = [
  { id: 'q1', label: 'Quel est votre niveau actuel en comptabilité générale ?', type: 'scale' as const, scale: ['Débutant', 'Bases', 'Intermédiaire', 'Avancé', 'Expert'] },
  { id: 'q2', label: 'Quels sont vos objectifs précis pour cette formation ?', type: 'textarea' as const },
  { id: 'q3', label: 'Avez-vous des contraintes de planning à signaler ?', type: 'textarea' as const },
  { id: 'q4', label: 'Comment souhaitez-vous être recontactée à l\'issue de la formation ?', type: 'choice' as const, choices: ['Email uniquement', 'Email + téléphone', 'Pas de recontact'] },
];

export default function QuestionnairePage() {
  const [done, setDone] = useState(false);

  if (done) {
    return (
      <div className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="max-w-[400px] text-center">
          <div className="w-16 h-16 rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mx-auto mb-4">
            <Check className="w-8 h-8" />
          </div>
          <h1 className="text-2xl font-medium">Merci pour vos réponses.</h1>
          <p className="text-[13px] text-zinc-500 dark:text-zinc-400 mt-2">
            Votre formateur les consultera avant le démarrage de la formation pour adapter le parcours.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col items-center px-4 py-12">
      <div className="w-full max-w-[480px]">
        <div className="text-center mb-7">
          <p className="text-[11px] tracking-wider uppercase text-zinc-500 dark:text-zinc-400 mb-1">
            Questionnaire de positionnement
          </p>
          <h1 className="text-2xl font-medium">Avant de commencer la formation</h1>
          <p className="text-[13px] text-zinc-500 dark:text-zinc-400 mt-2">
            5 minutes maximum · vos réponses servent à personnaliser le parcours.
          </p>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            setDone(true);
          }}
          className="space-y-7"
        >
          {questions.map((q, i) => (
            <fieldset key={q.id}>
              <legend className="text-[15px] font-medium mb-3">
                <span className="font-mono text-[11px] text-zinc-400 mr-2">{i + 1}.</span>
                {q.label}
              </legend>

              {q.type === 'scale' && (
                <div className="grid grid-cols-5 gap-1.5">
                  {q.scale.map((s, idx) => (
                    <label
                      key={s}
                      className={
                        idx === 1
                          ? 'border border-zinc-900 dark:border-zinc-100 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-md px-2 py-2 text-[11px] text-center cursor-pointer'
                          : 'border border-zinc-200/60 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 rounded-md px-2 py-2 text-[11px] text-center cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-900'
                      }
                    >
                      <input type="radio" name={q.id} value={s} className="sr-only" defaultChecked={idx === 1} />
                      {s}
                    </label>
                  ))}
                </div>
              )}

              {q.type === 'textarea' && (
                <textarea
                  rows={3}
                  className="w-full bg-zinc-50 dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-md px-3 py-2 text-[13px] focus:outline-none focus:border-zinc-300 dark:focus:border-zinc-700 placeholder:text-zinc-400"
                  placeholder="Votre réponse…"
                />
              )}

              {q.type === 'choice' && (
                <div className="space-y-1.5">
                  {q.choices.map((c, idx) => (
                    <label
                      key={c}
                      className="bg-zinc-50 dark:bg-zinc-900 rounded-lg px-3 py-2.5 flex items-center gap-3 cursor-pointer hover:bg-zinc-100 dark:hover:bg-zinc-800 transition"
                    >
                      <input type="radio" name={q.id} value={c} defaultChecked={idx === 0} />
                      <span className="text-[13px]">{c}</span>
                    </label>
                  ))}
                </div>
              )}
            </fieldset>
          ))}

          <div className="flex justify-end pt-4">
            <button
              type="submit"
              className="bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-[13px] font-medium px-4 py-2 rounded-md hover:bg-zinc-800 dark:hover:bg-zinc-200 transition inline-flex items-center gap-2"
            >
              Envoyer mes réponses
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
