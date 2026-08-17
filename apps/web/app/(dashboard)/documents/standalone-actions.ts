'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { authActionClient, type AuthCtx } from '@/shared/lib/safe-action';
import { resolveOrgVariables } from '@/features/documents/templates/resolve-org-variables';
import { generateDocumentHtml } from '@/features/documents/templates/generate-with-ai';
import { wrapGeneratedHtml } from '@/features/documents/templates/wrap-generated-html';
import { getLegalRequirement } from '@/features/documents/legal/requirements';
import { GenerateStandaloneAiSchema } from './standalone-schema';

// Résout l'organisation courante depuis la table members (RLS-scopé), org par défaut en tête.
async function resolveOrgId(ctx: AuthCtx): Promise<string | null> {
  const { data: member } = await ctx.supabase
    .schema('app')
    .from('members')
    .select('organization_id')
    .eq('user_id', ctx.userId)
    .is('deleted_at', null)
    .order('is_default_org', { ascending: false })
    .limit(1)
    .maybeSingle();
  return (member as { organization_id: string } | null)?.organization_id ?? null;
}

// Génère un document autonome (SANS dossier) par IA, à partir des seules
// données de l'organisme. Le document est rattachable à un dossier plus tard.
export const generateStandaloneWithAI = authActionClient
  .schema(GenerateStandaloneAiSchema)
  .action(async ({ parsedInput, ctx }) => {
    const sb = ctx.supabase;
    const organizationId = await resolveOrgId(ctx);
    if (!organizationId) return { ok: false as const, error: 'organization_not_found' };

    const variables = await resolveOrgVariables(sb, organizationId);

    const gen = await generateDocumentHtml(parsedInput.kind, parsedInput.instruction, variables);
    if (!gen.ok) {
      return {
        ok: false as const,
        error: gen.reason === 'no_api_key' ? 'ai_unavailable' : 'generation_failed',
      };
    }

    const title = parsedInput.title.trim() || getLegalRequirement(parsedInput.kind).label;
    const html = wrapGeneratedHtml(gen.html, variables);

    const { data: inserted, error } = await sb
      .schema('app')
      .from('documents')
      .insert({
        organization_id: organizationId,
        dossier_id: null,
        kind: parsedInput.kind,
        title,
        status: 'ready',
        content_html: html,
        generated_at: new Date().toISOString(),
        generation_input: { ai: true, standalone: true, kind: parsedInput.kind, instruction: parsedInput.instruction, model: gen.model },
      } as never)
      .select('id')
      .single();
    if (error || !inserted) {
      return { ok: false as const, error: 'document_create_failed', details: error?.message };
    }

    revalidatePath('/documents');
    return { ok: true as const, documentId: (inserted as { id: string }).id };
  });
