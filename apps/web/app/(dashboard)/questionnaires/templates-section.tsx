'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAction } from 'next-safe-action/hooks';
import { Pencil, Trash2, Copy, ClipboardList } from 'lucide-react';
import { ACCENTS } from '@/shared/ui/kpi-card';
import { TEMPLATE_KINDS } from '@/features/questionnaire/template.schema';
import { deleteQuestionnaireTemplate } from './actions';

const KIND_LABEL = Object.fromEntries(TEMPLATE_KINDS.map((k) => [k.value, k.label]));

const ROW_GRID = 'grid grid-cols-[minmax(0,2fr)_minmax(0,1.2fr)_110px_100px_80px] gap-4 px-5';

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
    <div className="bg-white dark:bg-zinc-900 border border-zinc-200/70 dark:border-zinc-800 rounded-xl shadow-sm overflow-x-auto">
      <div className="min-w-[640px]">
        <div className={`${ROW_GRID} h-9 items-center text-[11px] font-bold uppercase tracking-[0.06em] text-zinc-500 dark:text-zinc-400 bg-zinc-50 dark:bg-zinc-950/40 border-b border-zinc-200/70 dark:border-zinc-800`}>
          <div>Modèle</div>
          <div>Type</div>
          <div>Questions</div>
          <div>Origine</div>
          <div className="text-right">Actions</div>
        </div>
        <ul className="divide-y divide-zinc-100 dark:divide-zinc-800/80">
          {templates.map((t) => (
            <li key={t.id} className={`${ROW_GRID} py-3.5 items-center text-[13px] hover:bg-zinc-50/80 dark:hover:bg-zinc-800/30 transition-colors`}>
              <div className="min-w-0 flex items-center gap-3">
                <span className={`w-9 h-9 rounded-lg grid place-items-center shrink-0 ${ACCENTS.blue.soft}`}>
                  <ClipboardList className="w-4 h-4" />
                </span>
                <Link href={`/questionnaires/${t.id}`} className="min-w-0 truncate text-[15px] font-bold text-zinc-900 dark:text-zinc-100 hover:underline">
                  {t.title}
                </Link>
              </div>
              <span className={`truncate font-semibold ${ACCENTS.blue.text}`}>{KIND_LABEL[t.kind] ?? t.kind}</span>
              <span>
                <span className={`text-[12px] font-bold tabular-nums px-2 py-0.5 rounded-full ${ACCENTS.blue.soft}`}>
                  {t.questionCount} question{t.questionCount > 1 ? 's' : ''}
                </span>
              </span>
              <div>
                {t.isSystem ? (
                  <span className={`inline-flex items-center h-6 px-2 rounded-md text-[12px] font-semibold ${ACCENTS.purple.soft}`}>
                    système
                  </span>
                ) : (
                  <span className={`inline-flex items-center h-6 px-2 rounded-md text-[12px] font-semibold ${ACCENTS.orange.soft}`}>Organisme</span>
                )}
              </div>
              <div className="flex items-center justify-end gap-0.5">
                <Link
                  href={`/questionnaires/${t.id}`}
                  aria-label={`${t.isSystem ? 'Dupliquer' : 'Modifier'} — ${t.title}`}
                  title={t.isSystem ? 'Dupliquer' : 'Modifier'}
                  className="w-8 h-8 rounded-md grid place-items-center text-zinc-500 dark:text-zinc-400 hover:bg-orange-50 hover:text-orange-600 dark:hover:bg-orange-950/40 dark:hover:text-orange-300 transition"
                >
                  {t.isSystem ? <Copy className="w-4 h-4" /> : <Pencil className="w-4 h-4" />}
                </Link>
                {!t.isSystem && (
                  <button
                    type="button"
                    onClick={() => {
                      if (confirm(`Supprimer le questionnaire « ${t.title} » ?`)) execute({ templateId: t.id });
                    }}
                    disabled={status === 'executing'}
                    className="w-8 h-8 rounded-md grid place-items-center text-zinc-500 dark:text-zinc-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40 dark:hover:text-red-400 transition disabled:opacity-50"
                    aria-label="Supprimer"
                    title="Supprimer"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
