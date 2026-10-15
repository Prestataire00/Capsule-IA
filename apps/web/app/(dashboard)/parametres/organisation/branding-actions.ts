'use server';

import { revalidatePath } from 'next/cache';
import { authActionClient } from '@/shared/lib/safe-action';
import type { AuthCtx } from '@/shared/lib/safe-action';
import { z } from 'zod';
import { OrgRepresentativeSchema, OrgAssetUploadSchema, OrgRibUploadSchema } from './branding-schema';
import { MIME_RIB, RIB_MAX_OCTETS, ribLisible, typeDuChemin } from '@/features/documents/rib-organisme';

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

/**
 * Le RIB de l'organisme, joint en dernière page de chaque facture. Écrit sous
 * RLS (org_assets : owner/admin de l'organisme, 0058) ; l'ancien fichier d'un
 * autre format est retiré.
 */
export const uploadOrgRibAction = authActionClient
  .schema(OrgRibUploadSchema)
  .action(async ({ parsedInput, ctx }) => {
    const orgId = await resolveOrgId(ctx);
    const bytes = Uint8Array.from(Buffer.from(parsedInput.base64, 'base64'));
    if (bytes.length > RIB_MAX_OCTETS) return { ok: false as const, error: 'Le fichier dépasse 5 Mo.' };
    if (!(await ribLisible({ bytes, type: parsedInput.type }))) {
      return { ok: false as const, error: 'Le fichier ne s’ouvre pas : déposez le PDF de votre banque, ou une image PNG ou JPG.' };
    }
    const { data: org } = await ctx.supabase.schema('app').from('organizations').select('rib_path' as never).eq('id', orgId).maybeSingle();
    const ancien = (org as { rib_path?: string | null } | null)?.rib_path ?? null;
    const path = `${orgId}/rib.${parsedInput.type}`;
    const { error: upErr } = await ctx.supabase.storage
      .from('org_assets')
      .upload(path, bytes, { contentType: MIME_RIB[parsedInput.type], upsert: true });
    if (upErr) return { ok: false as const, error: `Dépôt impossible : ${upErr.message}` };
    const { data: maj, error: updErr } = await ctx.supabase
      .schema('app')
      .from('organizations')
      .update({ rib_path: path } as never)
      .eq('id', orgId)
      .select('id');
    if (updErr) return { ok: false as const, error: `Enregistrement impossible : ${updErr.message}` };
    if (!maj || (maj as unknown[]).length === 0) return { ok: false as const, error: 'Réservé aux administrateurs de l’organisme.' };
    if (ancien && ancien !== path && typeDuChemin(ancien)) {
      const { error } = await ctx.supabase.storage.from('org_assets').remove([ancien]);
      if (error) console.error('[RIB] ancien fichier non retiré', ancien, error.message);
    }
    revalidatePath('/parametres/organisation');
    return { ok: true as const };
  });

export const removeOrgRibAction = authActionClient.schema(z.object({})).action(async ({ ctx }) => {
  const orgId = await resolveOrgId(ctx);
  const { data: org } = await ctx.supabase.schema('app').from('organizations').select('rib_path' as never).eq('id', orgId).maybeSingle();
  const path = (org as { rib_path?: string | null } | null)?.rib_path ?? null;
  const { data: maj, error } = await ctx.supabase
    .schema('app')
    .from('organizations')
    .update({ rib_path: null } as never)
    .eq('id', orgId)
    .select('id');
  if (error) return { ok: false as const, error: error.message };
  if (!maj || (maj as unknown[]).length === 0) return { ok: false as const, error: 'Réservé aux administrateurs de l’organisme.' };
  if (path) {
    const { error: rmErr } = await ctx.supabase.storage.from('org_assets').remove([path]);
    if (rmErr) console.error('[RIB] fichier non retiré', path, rmErr.message);
  }
  revalidatePath('/parametres/organisation');
  return { ok: true as const };
});
