'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { authActionClient, type AuthCtx } from '@/shared/lib/safe-action';
import { supabaseAdmin } from '@/shared/lib/supabase/admin';

// Résout l'organisation courante depuis members (RLS-scopé), org par défaut en tête.
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

// Met à jour le contenu HTML d'un document généré (édition dans l'aperçu).
// Service role + garde d'organisation (pas de policy documents_update en RLS).
export const updateDocumentHtml = authActionClient
  .schema(z.object({ documentId: z.string().uuid(), contentHtml: z.string().max(200_000) }))
  .action(async ({ parsedInput, ctx }) => {
    const orgId = await resolveOrgId(ctx);
    if (!orgId) return { ok: false as const, error: 'organization_not_found' };

    const { error } = await supabaseAdmin()
      .schema('app')
      .from('documents')
      .update({ content_html: parsedInput.contentHtml, updated_at: new Date().toISOString() } as never)
      .eq('id', parsedInput.documentId)
      .eq('organization_id', orgId)
      .is('deleted_at', null);
    if (error) return { ok: false as const, error: 'update_failed', details: error.message };

    revalidatePath(`/documents/${parsedInput.documentId}/apercu`);
    return { ok: true as const };
  });
