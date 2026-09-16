'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Trash2, Loader2, Check, X, ListChecks, PenLine } from 'lucide-react';
import { MAX_CHOIX, problemesDuQuiz, type QuestionQuiz } from '@/features/pedagogie/quiz';
import { creerTravailFormateur } from './actions';

/**
 * Création d'un devoir ou d'un quiz par le formateur.
 *
 * Les bonnes réponses se cochent dans la grille même : les séparer de l'énoncé
 * obligerait à recompter les propositions de tête, et c'est là qu'on se trompe.
 * Ce qui empêche la publication s'affiche avant qu'on ne clique.
 */

type Brouillon = {
  id: string;
  enonce: string;
  choix: string[];
  bonnes: number[];
  points: number;
};

const CHAMP =
  'w-full h-9 px-3 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-[13px] text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400';

const nouvelleQuestion = (): Brouillon => ({
  id: crypto.randomUUID(),
  enonce: '',
  choix: ['', ''],
  bonnes: [],
  points: 1,
});

export function CreerTravail({ dossierId, seances }: { dossierId: string; seances: Array<{ id: string; label: string }> }) {
  const router = useRouter();
  const [ouvert, setOuvert] = useState(false);
  const [kind, setKind] = useState<'quiz' | 'devoir'>('quiz');
  const [title, setTitle] = useState('');
  const [instructions, setInstructions] = useState('');
  const [sessionId, setSessionId] = useState('');
  const [dueAt, setDueAt] = useState('');
  const [passScore, setPassScore] = useState('');
  const [questions, setQuestions] = useState<Brouillon[]>([nouvelleQuestion()]);
  const [erreur, setErreur] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const majQuestion = (i: number, patch: Partial<Brouillon>) =>
    setQuestions((qs) => qs.map((q, j) => (j === i ? { ...q, ...patch } : q)));

  const basculerBonne = (i: number, index: number) =>
    setQuestions((qs) =>
      qs.map((q, j) =>
        j === i
          ? { ...q, bonnes: q.bonnes.includes(index) ? q.bonnes.filter((b) => b !== index) : [...q.bonnes, index] }
          : q,
      ),
    );

  const pourValidation: QuestionQuiz[] = questions.map((q) => ({
    id: q.id,
    enonce: q.enonce,
    choix: q.choix,
    bonnes: q.bonnes,
    points: q.points,
  }));
  const problemes = kind === 'quiz' ? problemesDuQuiz(pourValidation) : [];

  const reinitialiser = () => {
    setTitle('');
    setInstructions('');
    setSessionId('');
    setDueAt('');
    setPassScore('');
    setQuestions([nouvelleQuestion()]);
  };

  const enregistrer = (publier: boolean) => {
    setErreur(null);
    if (!title.trim()) return setErreur('Donnez un titre.');
    startTransition(async () => {
      const res = await creerTravailFormateur({
        dossierId,
        kind,
        title: title.trim(),
        instructions: instructions.trim() || undefined,
        sessionId: sessionId || undefined,
        dueAt: dueAt || undefined,
        passScore: kind === 'quiz' && passScore.trim() ? Number(passScore) : null,
        questions: kind === 'quiz' ? pourValidation.map((q) => ({ ...q, choix: [...q.choix], bonnes: [...q.bonnes] })) : undefined,
        publier,
      });
      if (!res.ok) return setErreur(res.error);
      reinitialiser();
      setOuvert(false);
      router.refresh();
    });
  };

  if (!ouvert) {
    return (
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => {
            setKind('quiz');
            setOuvert(true);
          }}
          className="h-9 px-4 rounded-lg bg-orange-500 hover:bg-orange-600 text-white text-[13px] font-semibold inline-flex items-center gap-1.5 transition"
        >
          <ListChecks className="w-3.5 h-3.5" /> Créer un quiz
        </button>
        <button
          type="button"
          onClick={() => {
            setKind('devoir');
            setOuvert(true);
          }}
          className="h-9 px-4 rounded-lg border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 bg-white dark:bg-zinc-900 hover:bg-zinc-50 dark:hover:bg-zinc-800 text-[13px] font-semibold inline-flex items-center gap-1.5 transition"
        >
          <PenLine className="w-3.5 h-3.5" /> Créer un exercice
        </button>
      </div>
    );
  }

  return (
    <section className="rounded-xl border border-amber-100 dark:border-amber-900/40 bg-gradient-to-br from-amber-50 to-white dark:from-amber-950/25 dark:to-zinc-900 p-4 shadow-sm space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[15px] font-bold text-zinc-900 dark:text-zinc-100">
          {kind === 'quiz' ? 'Nouveau quiz' : 'Nouvel exercice'}
        </h2>
        <button
          type="button"
          onClick={() => setOuvert(false)}
          className="w-8 h-8 rounded-lg grid place-items-center text-zinc-500 hover:bg-white dark:hover:bg-zinc-800 transition"
          aria-label="Fermer"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder={kind === 'quiz' ? 'Titre du quiz (ex. Acquis de la journée 1)' : 'Titre de l’exercice'}
        maxLength={200}
        className={CHAMP}
      />

      <textarea
        value={instructions}
        onChange={(e) => setInstructions(e.target.value)}
        rows={2}
        maxLength={5000}
        placeholder="Consigne pour les stagiaires (facultatif)"
        className="w-full resize-y rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-[13px] text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400"
      />

      <div className="grid sm:grid-cols-3 gap-2">
        <label className="block space-y-1">
          <span className="text-[11px] font-bold uppercase tracking-wide text-zinc-500">Séance (facultatif)</span>
          <select value={sessionId} onChange={(e) => setSessionId(e.target.value)} className={CHAMP}>
            <option value="">Aucune</option>
            {seances.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block space-y-1">
          <span className="text-[11px] font-bold uppercase tracking-wide text-zinc-500">À rendre avant</span>
          <input type="datetime-local" value={dueAt} onChange={(e) => setDueAt(e.target.value)} className={CHAMP} />
        </label>
        {kind === 'quiz' && (
          <label className="block space-y-1">
            <span className="text-[11px] font-bold uppercase tracking-wide text-zinc-500">Seuil de réussite (%)</span>
            <input
              value={passScore}
              onChange={(e) => setPassScore(e.target.value.replace(/[^\d]/g, ''))}
              inputMode="numeric"
              placeholder="Aucun"
              className={`${CHAMP} tabular-nums`}
            />
          </label>
        )}
      </div>

      {kind === 'quiz' && (
        <div className="space-y-3">
          {questions.map((q, i) => (
            <div
              key={q.id}
              className="rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white/80 dark:bg-zinc-900/60 p-3 space-y-2"
            >
              <div className="flex items-start gap-2">
                <span className="text-[12px] font-bold text-zinc-400 tabular-nums mt-2 w-5 shrink-0">{i + 1}</span>
                <input
                  value={q.enonce}
                  onChange={(e) => majQuestion(i, { enonce: e.target.value })}
                  placeholder="Énoncé de la question"
                  maxLength={500}
                  className={CHAMP}
                />
                <input
                  value={q.points}
                  onChange={(e) => majQuestion(i, { points: Math.max(0, Number(e.target.value.replace(/[^\d]/g, '')) || 0) })}
                  inputMode="numeric"
                  title="Points"
                  aria-label={`Points de la question ${i + 1}`}
                  className={`${CHAMP} w-16 shrink-0 tabular-nums text-center`}
                />
                <button
                  type="button"
                  onClick={() => setQuestions((qs) => (qs.length === 1 ? qs : qs.filter((_, j) => j !== i)))}
                  aria-label={`Retirer la question ${i + 1}`}
                  className="w-9 h-9 rounded-md grid place-items-center text-zinc-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40 transition shrink-0"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>

              <div className="pl-7 space-y-1.5">
                {q.choix.map((c, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={q.bonnes.includes(index)}
                      onChange={() => basculerBonne(i, index)}
                      aria-label={`Bonne réponse : proposition ${index + 1}`}
                      className="w-4 h-4 rounded border-zinc-300 text-emerald-600 focus:ring-emerald-500 shrink-0"
                    />
                    <input
                      value={c}
                      onChange={(e) =>
                        majQuestion(i, { choix: q.choix.map((v, j) => (j === index ? e.target.value : v)) })
                      }
                      placeholder={`Proposition ${index + 1}`}
                      maxLength={300}
                      className={CHAMP}
                    />
                    {q.choix.length > 2 && (
                      <button
                        type="button"
                        onClick={() =>
                          majQuestion(i, {
                            choix: q.choix.filter((_, j) => j !== index),
                            bonnes: q.bonnes.filter((b) => b !== index).map((b) => (b > index ? b - 1 : b)),
                          })
                        }
                        aria-label={`Retirer la proposition ${index + 1}`}
                        className="w-8 h-8 rounded-md grid place-items-center text-zinc-400 hover:text-red-600 shrink-0"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                ))}
                {q.choix.length < MAX_CHOIX && (
                  <button
                    type="button"
                    onClick={() => majQuestion(i, { choix: [...q.choix, ''] })}
                    className="text-[12px] font-medium text-orange-600 dark:text-orange-400 hover:underline inline-flex items-center gap-1"
                  >
                    <Plus className="w-3 h-3" /> Ajouter une proposition
                  </button>
                )}
                <p className="text-[11px] text-zinc-400">
                  Cochez la ou les bonnes réponses. Plusieurs cases cochées : tout doit être juste.
                </p>
              </div>
            </div>
          ))}

          <button
            type="button"
            onClick={() => setQuestions((qs) => [...qs, nouvelleQuestion()])}
            className="h-9 px-3 rounded-lg text-[13px] font-medium inline-flex items-center gap-1.5 border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 bg-white/70 dark:bg-zinc-900/60 hover:bg-white dark:hover:bg-zinc-800 transition"
          >
            <Plus className="w-3.5 h-3.5" /> Ajouter une question
          </button>
        </div>
      )}

      {problemes.length > 0 && (
        <ul className="space-y-0.5">
          {problemes.slice(0, 4).map((p, i) => (
            <li key={i} className="text-[12px] text-amber-700 dark:text-amber-400">
              {p.question ? `Question ${p.question} : ` : ''}
              {p.motif}
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap items-center gap-2 pt-1">
        <button
          type="button"
          onClick={() => enregistrer(true)}
          disabled={pending || (kind === 'quiz' && problemes.length > 0)}
          className="h-9 px-4 rounded-lg bg-orange-500 hover:bg-orange-600 text-white text-[13px] font-semibold inline-flex items-center gap-1.5 transition disabled:opacity-50"
        >
          {pending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
          Publier aux stagiaires
        </button>
        <button
          type="button"
          onClick={() => enregistrer(false)}
          disabled={pending}
          className="h-9 px-3 rounded-lg text-[13px] font-medium border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 bg-white/70 dark:bg-zinc-900/60 hover:bg-white dark:hover:bg-zinc-800 transition disabled:opacity-60"
        >
          Garder en brouillon
        </button>
      </div>

      {erreur && <p className="text-[12px] text-red-600 dark:text-red-400">{erreur}</p>}
    </section>
  );
}
