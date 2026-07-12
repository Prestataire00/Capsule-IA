'use server';

import { revalidatePath } from 'next/cache';
import { authActionClient } from '@/shared/lib/safe-action';
import { resolveDossierVariables } from '@/features/documents/templates/resolve-dossier-variables';
import { generateDocumentHtml } from '@/features/documents/templates/generate-with-ai';
import { wrapGeneratedHtml } from '@/features/documents/templates/wrap-generated-html';
import { getLegalRequirement } from '@/features/documents/legal/requirements';
import { GenerateWithAiSchema } from './phase3-schema';

export const generateDocumentWithAI = authActionClient
  .schema(GenerateWithAiSchema)
  .action(async ({ parsedInput, ctx }) => {
    const sb = ctx.supabase;

    const resolved = await resolveDossierVariables(sb, parsedInput.dossierId);
    if (!resolved) return { ok: false as const, error: 'dossier_not_found' };

    const gen = await generateDocumentHtml(parsedInput.kind, parsedInput.instruction, resolved.variables);
    if (!gen.ok) {
      return {
        ok: false as const,
        error: gen.reason === 'no_api_key' ? 'ai_unavailable' : 'generation_failed',
      };
    }

    // Titre par défaut : libellé du type de document si l'utilisateur n'en fournit pas.
    const title = parsedInput.title.trim() || getLegalRequirement(parsedInput.kind).label;
    // En-tête de marque (logo organisme) + pied de page légal, appliqués à TOUS les documents.
    const html = wrapGeneratedHtml(gen.html, resolved.variables);

    const { data: inserted, error } = await sb
      .schema('app')
      .from('documents')
      .insert({
        organization_id: resolved.organizationId,
        dossier_id: parsedInput.dossierId,
        kind: parsedInput.kind,
        title,
        status: 'ready',
        content_html: html,
        generated_at: new Date().toISOString(),
        generation_input: { ai: true, kind: parsedInput.kind, instruction: parsedInput.instruction, model: gen.model },
      } as never)
      .select('id')
      .single();
    if (error || !inserted) {
      return { ok: false as const, error: 'document_create_failed', details: error?.message };
    }

    revalidatePath(`/dossiers/${parsedInput.dossierId}/documents`);
    return { ok: true as const, documentId: (inserted as { id: string }).id };
  });
