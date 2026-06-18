// ARCHETYPE: workflow
// Justification: création d'un modèle de document (éditeur plein écran).

import { TemplateEditor } from '../_components/template-editor';

export default function NewTemplatePage() {
  return (
    <div className="max-w-4xl mx-auto py-8 px-6">
      <TemplateEditor />
    </div>
  );
}
