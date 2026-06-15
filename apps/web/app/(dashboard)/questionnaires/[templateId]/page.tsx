// ARCHETYPE: workflow
// Justification: édition d'un questionnaire type existant (org).

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, ClipboardList } from 'lucide-react';
import { supabaseServer } from '@/shared/lib/supabase/server';
import { TemplateEditor } from '../template-editor';
import { toDraftQuestion, type TemplateFormValues, type TemplateKind } from '@/features/questionnaire/template.schema';
import type { QuestionnaireSchema } from '@/features/questionnaire/schema';

export const dynamic = 'force-dynamic';

export default async function EditQuestionnairePage({ params }: { params: { templateId: string } }) {
  const sb = supabaseServer();
  const { data } = await sb
    .schema('app')
    .from('questionnaire_templates')
    .select('id, title, kind, schema, thank_you_message, organization_id')
    .eq('id', params.templateId)
    .is('deleted_at', null)
    .maybeSingle();

  const tpl = data as {
    title: string;
    kind: string;
    schema: QuestionnaireSchema;
    thank_you_message: string | null;
    organization_id: string | null;
  } | null;
  if (!tpl) return notFound();

  const isSystem = tpl.organization_id === null;
  const initial: TemplateFormValues = {
    templateId: isSystem ? undefined : params.templateId, // un template système → on en crée une copie org
    title: isSystem ? `${tpl.title} (copie)` : tpl.title,
    kind: tpl.kind as TemplateKind,
    thankYou: tpl.thank_you_message ?? '',
    questions: (tpl.schema?.questions ?? []).map(toDraftQuestion),
  };

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
          <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100 tracking-tight">
            {isSystem ? 'Dupliquer ce modèle' : 'Modifier le questionnaire'}
          </h1>
          <p className="text-[13px] text-zinc-500 dark:text-zinc-400 mt-0.5">
            {isSystem ? 'Ce modèle système sera copié dans vos questionnaires.' : 'Mise à jour du modèle de votre organisme.'}
          </p>
        </div>
      </header>
      <TemplateEditor initial={initial} />
    </div>
  );
}
