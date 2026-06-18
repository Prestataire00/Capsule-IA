// ARCHETYPE: workflow
// Justification: édition d'un modèle de document existant.

import { notFound } from 'next/navigation';
import { supabaseServer } from '@/shared/lib/supabase/server';
import { TemplateEditor, type EditorTemplate, type FormationChoice } from '../_components/template-editor';
import type { TemplateKind } from '../schema';

export const dynamic = 'force-dynamic';

export default async function EditTemplatePage({ params }: { params: { id: string } }) {
  const sb = supabaseServer();
  const [tplRes, formationsRes] = await Promise.all([
    sb
      .schema('app')
      .from('document_templates')
      .select('id, kind, title, content_html, formation_id')
      .eq('id', params.id)
      .is('deleted_at', null)
      .maybeSingle(),
    sb
      .schema('app')
      .from('formations')
      .select('id, title')
      .is('deleted_at', null)
      .order('title', { ascending: true }),
  ]);

  const row = tplRes.data as unknown as {
    id: string;
    kind: string;
    title: string;
    content_html: string | null;
    formation_id: string | null;
  } | null;
  if (!row) notFound();

  const formations = ((formationsRes.data as unknown as Array<{ id: string; title: string }>) ?? []).map<FormationChoice>(
    (f) => ({ id: f.id, title: f.title }),
  );

  const template: EditorTemplate = {
    id: row.id,
    kind: row.kind as TemplateKind,
    title: row.title,
    contentHtml: row.content_html ?? '',
    formationId: row.formation_id,
  };

  return (
    <div className="max-w-4xl mx-auto py-8 px-6">
      <TemplateEditor template={template} formations={formations} />
    </div>
  );
}
