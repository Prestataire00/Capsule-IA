'use client';

import { useState } from 'react';
import { useAction } from 'next-safe-action/hooks';
import { Loader2, Send, CheckCircle2 } from 'lucide-react';
import { FormField, inputClass } from '@/shared/ui/form-field';
import { Button } from '@/shared/ui/button';
import { assignQuestionnaireToSession } from '../session-actions';

export type Template = { id: string; title: string; kind: string };

export function QuestionnaireSessionForm({
  sessionId,
  templates,
  learnerCount,
}: {
  sessionId: string;
  templates: Template[];
  learnerCount: number;
}) {
  const [templateId, setTemplateId] = useState('');
  const assign = useAction(assignQuestionnaireToSession);

  const res = assign.result?.data;
  const err = res && !res.ok ? res.error : assign.result?.serverError ? 'Erreur serveur.' : null;

  if (templates.length === 0) {
    return <p className="text-[13px] text-zinc-500 dark:text-zinc-400">Aucun modèle de questionnaire actif.</p>;
  }

  return (
    <div className="bg-white dark:bg-zinc-900 border border-zinc-200/70 dark:border-zinc-800 rounded-xl shadow-sm p-5 space-y-4 max-w-xl">
      <FormField label="Assigner un questionnaire à tous les apprenants de la session">
        <select className={inputClass} value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
          <option value="">— Choisir un modèle —</option>
          {templates.map((t) => (
            <option key={t.id} value={t.id}>
              {t.title}
            </option>
          ))}
        </select>
      </FormField>

      <div className="flex items-center gap-3">
        <Button
          type="button"
          variant="brand"
          disabled={!templateId || assign.isExecuting || learnerCount === 0}
          onClick={() => assign.execute({ sessionId, templateId })}
        >
          {assign.isExecuting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          Assigner à tous ({learnerCount})
        </Button>
        {res?.ok && (
          <span className="inline-flex items-center gap-1.5 text-[13px] text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="w-4 h-4" /> {res.assigned} assigné(s){res.skipped ? `, ${res.skipped} déjà fait(s)` : ''}.
          </span>
        )}
        {err && <span className="text-[13px] text-rose-600 dark:text-rose-400">{err}</span>}
      </div>
    </div>
  );
}
