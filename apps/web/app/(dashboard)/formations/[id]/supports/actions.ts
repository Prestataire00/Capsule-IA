'use server';

import { revalidatePath } from 'next/cache';
import { authActionClient } from '@/shared/lib/safe-action';
import {
  uploadSupportSchema,
  togglePublishSchema,
  deleteSupportSchema,
} from '@/features/resources/upload-support.schema';
import { getCurrentMember } from '@/shared/lib/auth/current-member';

/**
 * Résout l'organization_id du membre connecté.
 *
 * Interrogeait `app.memberships` — table qui n'existe pas (audit CAP-16) : la
 * requête échouait, `data` restait null, et la fonctionnalité était morte sans
 * le moindre message. La table réelle est `app.members`, déjà lue par
 * `getCurrentMember()`.
 */
async function resolveOrgId(): Promise<string | null> {
  const me = await getCurrentMember();
  return me?.organizationId ?? null;
}

export const createSupport = authActionClient
  .schema(uploadSupportSchema)
  .action(async ({ parsedInput, ctx }) => {
    const orgId = await resolveOrgId();
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
