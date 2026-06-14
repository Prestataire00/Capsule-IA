'use server';

import { revalidatePath } from 'next/cache';
import { authActionClient } from '@/shared/lib/safe-action';
import { supabaseServer } from '@/shared/lib/supabase/server';
import {
  uploadSupportSchema,
  togglePublishSchema,
  deleteSupportSchema,
} from '@/features/resources/upload-support.schema';

/** Résout l'organization_id du membre connecté (via RLS memberships). */
async function resolveOrgId(userId: string): Promise<string | null> {
  const sb = supabaseServer();
  const { data } = await sb
    .schema('app')
    .from('memberships')
    .select('organization_id')
    .eq('user_id', userId)
    .maybeSingle();
  return (data as { organization_id: string } | null)?.organization_id ?? null;
}

export const createSupport = authActionClient
  .schema(uploadSupportSchema)
  .action(async ({ parsedInput, ctx }) => {
    const orgId = await resolveOrgId(ctx.userId as string);
    if (!orgId) throw new Error('Organisation introuvable');

    const { error } = await ctx.supabase
      .schema('app')
      .from('module_resources' as never)
      .insert({
        organization_id: orgId,
        module_id: parsedInput.moduleId,
        title: parsedInput.title,
        description: parsedInput.description ?? null,
        storage_path: parsedInput.storagePath,
        mime_type: parsedInput.mimeType,
        file_size_bytes: parsedInput.fileSizeBytes ?? null,
        created_by: ctx.userId as string,
        is_published: true,
      } as never);

    if (error) throw new Error(error.message);

    revalidatePath('/formations');
    return { ok: true };
  });

export const toggleSupportPublish = authActionClient
  .schema(togglePublishSchema)
  .action(async ({ parsedInput, ctx }) => {
    const { error } = await ctx.supabase
      .schema('app')
      .from('module_resources' as never)
      .update({
        is_published: parsedInput.isPublished,
        updated_at: new Date().toISOString(),
      } as never)
      .eq('id', parsedInput.resourceId);

    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteSupport = authActionClient
  .schema(deleteSupportSchema)
  .action(async ({ parsedInput, ctx }) => {
    const { error } = await ctx.supabase
      .schema('app')
      .from('module_resources' as never)
      .update({
        deleted_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      } as never)
      .eq('id', parsedInput.resourceId);

    if (error) throw new Error(error.message);
    return { ok: true };
  });
