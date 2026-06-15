// ARCHETYPE: workflow
// Justification: création d'un questionnaire type (éditeur de questions + génération IA).

import Link from 'next/link';
import { ArrowLeft, ClipboardList } from 'lucide-react';
import { TemplateEditor } from '../template-editor';
import { emptyTemplateValues } from '@/features/questionnaire/template.schema';

export default function NouveauQuestionnairePage() {
  return (
    <div className="max-w-5xl w-full mx-auto px-8 py-8">
      <Link href="/questionnaires" className="text-[13px] text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 inline-flex items-center gap-1.5 transition mb-6">
        <ArrowLeft className="w-3.5 h-3.5" /> Questionnaires
      </Link>
      <header className="mb-6 flex items-center gap-3">
        <span className="w-11 h-11 rounded-xl bg-gradient-to-br from-orange-100 to-orange-50 dark:from-orange-950/60 dark:to-orange-950/30 text-orange-700 dark:text-orange-300 flex items-center justify-center shadow-sm">
          <ClipboardList className="w-5 h-5" />
        </span>
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100 tracking-tight">Nouveau questionnaire</h1>
          <p className="text-[13px] text-zinc-500 dark:text-zinc-400 mt-0.5">Questions libres, QCM, échelles et NPS — ou laissez l'IA proposer.</p>
        </div>
      </header>
      <TemplateEditor initial={emptyTemplateValues} />
    </div>
  );
}
