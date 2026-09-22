// ARCHETYPE: workflow
// Justification: édition d'un questionnaire type existant (org).

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, ClipboardList } from 'lucide-react';
import { ACCENTS } from '@/shared/ui/kpi-card';
import { SectionLabel } from '@/shared/ui/section-label';
import { supabaseServer } from '@/shared/lib/supabase/server';
import { TemplateEditor } from '../template-editor';
import { toDraftQuestion, type TemplateFormValues, type TemplateKind } from '@/features/questionnaire/template.schema';
import type { QuestionnaireSchema } from '@/features/questionnaire/schema';

export const dynamic = 'force-dynamic';

export default async function EditQuestionnairePage({ params }: { params: { templateId: string } }) {
  const sb = supabaseServer();
  const { data, error: erreurLecture } = await sb
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
  // Une requête en échec n'est pas une ligne absente : sans cette distinction,
  // toute panne s'affiche en 404 (incident du 21/09/2026).
  if (erreurLecture) {
    console.error('[modèle de questionnaire] lecture impossible', erreurLecture.code, erreurLecture.message);
    throw new Error(`Lecture impossible (modèle de questionnaire) : ${erreurLecture.message}`);
  }
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
          <h1 className="text-[30px] leading-none font-extrabold text-zinc-900 dark:text-zinc-100">
            {isSystem ? 'Dupliquer ce modèle' : 'Modifier le questionnaire'}
          </h1>
          <p className="text-[13px] text-zinc-500 dark:text-zinc-400 mt-3">
            {isSystem ? 'Ce modèle système sera copié dans vos questionnaires.' : 'Mise à jour du modèle de votre organisme.'}
          </p>
        </div>
      </header>
      <TemplateEditor initial={initial} />
    </div>
  );
}
