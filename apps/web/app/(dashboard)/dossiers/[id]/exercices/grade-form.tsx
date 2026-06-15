'use client';

import { useState } from 'react';
import { Loader2, Star } from 'lucide-react';
import { useAction } from 'next-safe-action/hooks';
import { gradeSubmission } from './actions';

export function GradeForm({
  submissionId,
  currentGrade,
  currentFeedback,
}: {
  submissionId: string;
  currentGrade: number | null;
  currentFeedback: string | null;
}) {
  const [grade, setGrade] = useState(currentGrade?.toString() ?? '');
  const [feedback, setFeedback] = useState(currentFeedback ?? '');
  const action = useAction(gradeSubmission);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    action.execute({
      submissionId,
      grade: grade !== '' ? Number(grade) : undefined,
      feedback: feedback.trim() || undefined,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="mt-2 space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-1.5">
          <Star className="w-3.5 h-3.5 text-amber-500" />
          <input
            type="number"
            value={grade}
            onChange={(e) => setGrade(e.target.value)}
            placeholder="Note"
            min={0}
            step={0.5}
            className="w-20 text-[12px] px-2 py-1 rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-none focus:ring-1 focus:ring-amber-400 shadow-sm"
          />
        </div>
        <input
          type="text"
          value={feedback}
          onChange={(e) => setFeedback(e.target.value)}
          placeholder="Retour (optionnel)"
          maxLength={5000}
          className="flex-1 min-w-[180px] text-[12px] px-2 py-1 rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-none focus:ring-1 focus:ring-amber-400 shadow-sm"
        />
        <button
          type="submit"
          disabled={action.isExecuting}
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-zinc-200/60 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:bg-zinc-50 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 text-[11px] font-medium shadow-sm transition disabled:opacity-50"
        >
          {action.isExecuting ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
          Corriger
        </button>
      </div>
      {action.result?.data?.ok && !action.isExecuting && (
        <p className="text-[11px] text-emerald-600 dark:text-emerald-400">Correction enregistrée.</p>
      )}
      {action.result?.serverError && (
        <p className="text-[11px] text-red-600 dark:text-red-400">{String(action.result.serverError)}</p>
      )}
    </form>
  );
}
