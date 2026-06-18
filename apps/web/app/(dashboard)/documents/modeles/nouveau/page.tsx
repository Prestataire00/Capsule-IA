// ARCHETYPE: workflow
// Justification: création d'un modèle de document (éditeur plein écran).

import { supabaseServer } from '@/shared/lib/supabase/server';
import { TemplateEditor, type FormationChoice } from '../_components/template-editor';

export const dynamic = 'force-dynamic';

async function loadFormations(): Promise<FormationChoice[]> {
  const sb = supabaseServer();
  const { data } = await sb
    .schema('app')
    .from('formations')
    .select('id, title')
    .is('deleted_at', null)
    .order('title', { ascending: true });
  return ((data as unknown as Array<{ id: string; title: string }>) ?? []).map((f) => ({
    id: f.id,
    title: f.title,
  }));
}

export default async function NewTemplatePage() {
  const formations = await loadFormations();
  return (
    <div className="max-w-4xl mx-auto py-8 px-6">
      <TemplateEditor formations={formations} />
    </div>
  );
}
