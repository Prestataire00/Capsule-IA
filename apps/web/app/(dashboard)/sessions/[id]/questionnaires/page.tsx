import { notFound } from 'next/navigation';
import { supabaseServer } from '@/shared/lib/supabase/server';
import { loadSession } from '@/features/sessions/load-session';
import { QuestionnaireSessionForm, type Template } from './questionnaire-send.client';

export const dynamic = 'force-dynamic';

export default async function SessionQuestionnairesTab({ params }: { params: { id: string } }) {
  const sb = supabaseServer();
  const loaded = await loadSession(sb, params.id);
  if (!loaded) notFound();

  // Modèles destinés aux apprenants (RLS : org + modèles système).
  const { data } = await sb
    .schema('app')
    .from('questionnaire_templates')
    .select('id, title, kind, is_active')
    .eq('is_active', true)
    .order('title', { ascending: true });
  const templates = (((data as { id: string; title: string; kind: string }[] | null) ?? [])).map((t) => ({
    id: t.id,
    title: t.title,
    kind: t.kind,
  })) as Template[];

  return (
    <div className="space-y-4">
      <p className="text-[13px] text-zinc-600 dark:text-zinc-300">
        Assignez un questionnaire à <strong>tous les apprenants</strong> de la session en une fois. Chaque apprenant le
        remplit depuis son espace de formation.
      </p>
      <QuestionnaireSessionForm sessionId={params.id} templates={templates} learnerCount={loaded.learners.length} />
    </div>
  );
}
