// ARCHETYPE: workflow
// Justification: création d'un modèle de document (éditeur plein écran).

import { TemplateEditor } from '../_components/template-editor';
import { loadFormations, loadCategories, loadDossiers } from '../_options';

export const dynamic = 'force-dynamic';

export default async function NewTemplatePage() {
  const [formations, categories, dossiers] = await Promise.all([
    loadFormations(),
    loadCategories(),
    loadDossiers(),
  ]);
  return (
    <div className="max-w-4xl mx-auto py-8 px-6">
      <TemplateEditor formations={formations} categories={categories} dossiers={dossiers} />
    </div>
  );
}
