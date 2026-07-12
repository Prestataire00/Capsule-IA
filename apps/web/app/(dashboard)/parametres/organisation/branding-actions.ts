'use server';

import { revalidatePath } from 'next/cache';
import { authActionClient } from '@/shared/lib/safe-action';
import type { AuthCtx } from '@/shared/lib/safe-action';
import { OrgRepresentativeSchema, OrgAssetUploadSchema } from './branding-schema';

// `authActionClient` n'injecte pas l'org dans le contexte : on la résout depuis
// la table `members` (RLS-scopé sur l'utilisateur courant), org par défaut en tête.
async function resolveOrgId(ctx: AuthCtx): Promise<string> {
  const { data: member } = await ctx.supabase
    .schema('app')
    .from('members')
    .select('organization_id')
    .eq('user_id', ctx.userId)
    .is('deleted_at', null)
    .order('is_default_org', { ascending: false })
    .limit(1)
    .maybeSingle();
  const orgId = (member as { organization_id: string } | null)?.organization_id;
  if (!orgId) throw new Error('organization_not_found');
  return orgId;
}

export const updateOrgRepresentativeAction = authActionClient
  .schema(OrgRepresentativeSchema)
  .action(async ({ parsedInput, ctx }) => {
    const orgId = await resolveOrgId(ctx);
    const { error } = await ctx.supabase
      .schema('app')
      .from('organizations')
      // representative_* not yet in generated Database types (migration 0045, pending db:types regen).
      .update({
        representative_name: parsedInput.representativeName,
        representative_title: parsedInput.representativeTitle,
      } as never)
      .eq('id', orgId);
    if (error) throw new Error(`update_representative_failed: ${error.message}`);
    revalidatePath('/parametres/organisation');
    return { ok: true };
  });

export const uploadOrgAssetAction = authActionClient
  .schema(OrgAssetUploadSchema)
  .action(async ({ parsedInput, ctx }) => {
    const orgId = await resolveOrgId(ctx);
    const path = `${orgId}/${parsedInput.kind}.png`;
    const bytes = Uint8Array.from(Buffer.from(parsedInput.pngBase64, 'base64'));
    const { error: upErr } = await ctx.supabase.storage
      .from('org_assets')
      .upload(path, bytes, { contentType: 'image/png', upsert: true });
    if (upErr) throw new Error(`upload_asset_failed: ${upErr.message}`);
    const column =
      parsedInput.kind === 'signature'
        ? 'signature_path'
        : parsedInput.kind === 'logo'
          ? 'logo_path'
          : 'stamp_path';
    const { error: updErr } = await ctx.supabase
      .schema('app')
      .from('organizations')
      // signature_path/stamp_path not yet in generated Database types (migration 0045, pending db:types regen).
      .update({ [column]: path } as never)
      .eq('id', orgId);
    if (updErr) throw new Error(`update_asset_path_failed: ${updErr.message}`);
    revalidatePath('/parametres/organisation');
    return { ok: true, path };
  });
