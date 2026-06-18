// ARCHETYPE: workflow
// Justification: création d'un modèle de document (éditeur plein écran).

import { TemplateEditor } from '../_components/template-editor';
import { loadFormations, loadCategories } from '../_options';

export const dynamic = 'force-dynamic';

export default async function NewTemplatePage() {
  const [formations, categories] = await Promise.all([loadFormations(), loadCategories()]);
  return (
    <div className="max-w-4xl mx-auto py-8 px-6">
      <TemplateEditor formations={formations} categories={categories} />
    </div>
  );
}
