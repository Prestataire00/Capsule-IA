// ARCHETYPE: workflow
// Justification: édition d'un modèle de document existant.

import { notFound } from 'next/navigation';
import { supabaseServer } from '@/shared/lib/supabase/server';
import { TemplateEditor, type EditorTemplate } from '../_components/template-editor';
import type { TemplateKind } from '../schema';

export const dynamic = 'force-dynamic';

export default async function EditTemplatePage({ params }: { params: { id: string } }) {
  const sb = supabaseServer();
  const { data } = await sb
    .schema('app')
    .from('document_templates')
    .select('id, kind, title, content_html')
    .eq('id', params.id)
    .is('deleted_at', null)
    .maybeSingle();

  const row = data as unknown as {
    id: string;
    kind: string;
    title: string;
    content_html: string | null;
  } | null;
  if (!row) notFound();

  const template: EditorTemplate = {
    id: row.id,
    kind: row.kind as TemplateKind,
    title: row.title,
    contentHtml: row.content_html ?? '',
  };

  return (
    <div className="max-w-4xl mx-auto py-8 px-6">
      <TemplateEditor template={template} />
    </div>
  );
}
