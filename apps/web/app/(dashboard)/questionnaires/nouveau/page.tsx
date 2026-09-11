// ARCHETYPE: workflow
// Justification: création d'un questionnaire type (éditeur de questions + génération IA).

import Link from 'next/link';
import { ArrowLeft, ClipboardList } from 'lucide-react';
import { ACCENTS } from '@/shared/ui/kpi-card';
import { SectionLabel } from '@/shared/ui/section-label';
import { TemplateEditor } from '../template-editor';
import { emptyTemplateValues } from '@/features/questionnaire/template.schema';

export default function NouveauQuestionnairePage() {
  return (
    <div className="max-w-5xl w-full mx-auto px-8 py-9">
      <Link href="/questionnaires" className="text-[13px] text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 inline-flex items-center gap-1.5 transition mb-6">
        <ArrowLeft className="w-3.5 h-3.5" /> Questionnaires
      </Link>
      <header className="mb-7 flex items-start gap-4">
        <span className={`w-12 h-12 rounded-xl grid place-items-center text-white shadow-md shrink-0 ${ACCENTS.blue.chip}`}>
          <ClipboardList className="w-6 h-6" />
        </span>
        <div>
          <SectionLabel className="mb-2">Questionnaires</SectionLabel>
          <h1 className="text-[30px] leading-none font-extrabold text-zinc-900 dark:text-zinc-100">Nouveau questionnaire</h1>
          <p className="text-[14px] text-zinc-500 dark:text-zinc-400 mt-3">Questions libres, QCM, échelles et NPS — ou laissez l'IA proposer.</p>
        </div>
      </header>
      <TemplateEditor initial={emptyTemplateValues} />
    </div>
  );
}
