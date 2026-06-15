'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useAction } from 'next-safe-action/hooks';
import { Check, Loader2, UserPlus } from 'lucide-react';
import { assignLearnerQuestionnaire } from './actions';

const ERROR_LABEL: Record<string, string> = {
  no_learner: 'Aucun apprenant rattaché à ce dossier.',
  already_assigned: 'Ce questionnaire est déjà affecté à l’apprenant.',
  dossier_not_found: 'Dossier introuvable.',
  assignment_create_failed: 'L’affectation a échoué.',
};

export function AssignLearner({
  dossierId,
  templates,
}: {
  dossierId: string;
  templates: { id: string; title: string }[];
}) {
  const router = useRouter();
  const { executeAsync } = useAction(assignLearnerQuestionnaire);
  const [isPending, startTransition] = useTransition();
  const [templateId, setTemplateId] = useState(templates[0]?.id ?? '');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  if (templates.length === 0) {
    return <p className="text-[13px] text-zinc-500 dark:text-zinc-400">Aucun modèle disponible — créez-en un dans Questionnaires.</p>;
  }

  const selectClass =
    'rounded-lg border border-zinc-200/60 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-3 py-2 text-[13px] text-zinc-800 dark:text-zinc-200 focus:outline-none focus:ring-2 focus:ring-orange-500/40';

  const onAssign = () => {
    setMsg(null);
    startTransition(async () => {
      const res = await executeAsync({ dossierId, templateId: templateId || templates[0].id });
      if (res?.data?.ok) {
        setMsg({ ok: true, text: 'Questionnaire affecté — disponible dans l’espace apprenant.' });
        router.refresh();
      } else {
        const code = res?.data?.error;
        setMsg({ ok: false, text: (code ? ERROR_LABEL[code] : null) ?? 'L’affectation a échoué.' });
      }
    });
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <select value={templateId} onChange={(e) => setTemplateId(e.target.value)} className={selectClass} aria-label="Questionnaire">
          {templates.map((t) => (
            <option key={t.id} value={t.id}>{t.title}</option>
          ))}
        </select>
        <button
          type="button"
          onClick={onAssign}
          disabled={isPending}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-orange-500 text-white text-[13px] font-medium hover:bg-orange-600 disabled:opacity-50 shadow-sm transition"
        >
          {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
          Affecter à l’apprenant
        </button>
      </div>
      {msg && (
        <p className={`text-[12px] inline-flex items-center gap-1 ${msg.ok ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
          {msg.ok && <Check className="w-3 h-3" />}
          {msg.text}
        </p>
      )}
    </div>
  );
}
