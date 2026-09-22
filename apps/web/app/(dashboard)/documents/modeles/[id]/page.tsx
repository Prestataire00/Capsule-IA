// ARCHETYPE: workflow
// Justification: édition d'un modèle de document existant.

import { notFound } from 'next/navigation';
import { supabaseServer } from '@/shared/lib/supabase/server';
import { TemplateEditor, type EditorTemplate } from '../_components/template-editor';
import { loadFormations, loadCategories, loadDossiers } from '../_options';
import type { TemplateKind } from '../schema';

export const dynamic = 'force-dynamic';

export default async function EditTemplatePage({ params }: { params: { id: string } }) {
  const sb = supabaseServer();
  const [tplRes, formations, categories, dossiers] = await Promise.all([
    sb
      .schema('app')
      .from('document_templates')
      .select('id, kind, title, content_html, formation_id, category_id')
      .eq('id', params.id)
      .is('deleted_at', null)
      .maybeSingle(),
    loadFormations(),
    loadCategories(),
    loadDossiers(),
  ]);

  const erreurLecture = tplRes.error;
  const row = tplRes.data as unknown as {
    id: string;
    kind: string;
    title: string;
    content_html: string | null;
    formation_id: string | null;
    category_id: string | null;
  } | null;
  // Une requête en échec n'est pas une ligne absente : sans cette distinction,
  // toute panne s'affiche en 404 (incident du 21/09/2026). La lecture vit dans
  // un `Promise.all`, ce qui l'éloigne de sa garde sans rien changer à l'ordre.
  if (erreurLecture) {
    console.error('[modèle de document] lecture impossible', erreurLecture.code, erreurLecture.message);
    throw new Error(`Lecture impossible (modèle de document) : ${erreurLecture.message}`);
  }
  if (!row) notFound();

  const template: EditorTemplate = {
    id: row.id,
    kind: row.kind as TemplateKind,
    title: row.title,
    contentHtml: row.content_html ?? '',
    formationId: row.formation_id,
    categoryId: row.category_id,
  };

  return (
    <div className="max-w-4xl mx-auto py-8 px-6">
      <TemplateEditor template={template} formations={formations} categories={categories} dossiers={dossiers} />
    </div>
  );
}
