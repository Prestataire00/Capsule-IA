'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAction } from 'next-safe-action/hooks';
import { Pencil, Trash2, Copy, FileQuestion } from 'lucide-react';
import { TEMPLATE_KINDS } from '@/features/questionnaire/template.schema';
import { deleteQuestionnaireTemplate } from './actions';

const KIND_LABEL = Object.fromEntries(TEMPLATE_KINDS.map((k) => [k.value, k.label]));

export type TemplateItem = {
  id: string;
  title: string;
  kind: string;
  questionCount: number;
  isSystem: boolean;
};

export function TemplatesSection({ templates }: { templates: TemplateItem[] }) {
  const router = useRouter();
  const { execute, status } = useAction(deleteQuestionnaireTemplate, {
    onSettled: () => router.refresh(),
  });

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {templates.map((t) => (
        <div key={t.id} className="bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-xl shadow-sm p-4 flex flex-col gap-3">
          <div className="flex items-start gap-3">
            <span className="w-9 h-9 rounded-lg bg-orange-100 dark:bg-orange-950/40 text-orange-700 dark:text-orange-300 flex items-center justify-center flex-shrink-0">
              <FileQuestion className="w-4 h-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-semibold text-zinc-900 dark:text-zinc-100 truncate">{t.title}</p>
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">
                {KIND_LABEL[t.kind] ?? t.kind} · {t.questionCount} question{t.questionCount > 1 ? 's' : ''}
              </p>
            </div>
            {t.isSystem && (
              <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 flex-shrink-0">système</span>
            )}
          </div>
          <div className="flex items-center gap-2 mt-auto">
            <Link
              href={`/questionnaires/${t.id}`}
              className="flex-1 inline-flex items-center justify-center gap-1.5 text-[12px] font-medium px-3 py-1.5 rounded-lg border border-zinc-200/60 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-950 transition"
            >
              {t.isSystem ? <Copy className="w-3.5 h-3.5" /> : <Pencil className="w-3.5 h-3.5" />}
              {t.isSystem ? 'Dupliquer' : 'Modifier'}
            </Link>
            {!t.isSystem && (
              <button
                type="button"
                onClick={() => {
                  if (confirm(`Supprimer le questionnaire « ${t.title} » ?`)) execute({ templateId: t.id });
                }}
                disabled={status === 'executing'}
                className="inline-flex items-center justify-center w-8 h-8 rounded-lg border border-zinc-200/60 dark:border-zinc-800 text-zinc-400 hover:text-rose-500 hover:border-rose-200 transition disabled:opacity-50"
                aria-label="Supprimer"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
