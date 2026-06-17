'use server';

import { revalidatePath } from 'next/cache';
import { authActionClient } from '@/shared/lib/safe-action';
import { supabaseAdmin } from '@/shared/lib/supabase/admin';
import { namesMatch } from './name-match';
import { AnonymizeLearnerSchema, AnonymizeProspectSchema } from './rgpd-schema';

const OWNER_ADMIN_ROLES = ['owner', 'admin'] as const;

type ErrCode = 'forbidden_not_admin' | 'not_found' | 'active_dossier_exists' | 'name_mismatch';

type AnonymizeResult =
  | { ok: true; status: 'anonymized' | 'already_anonymized' }
  | { ok: false; error: ErrCode };

/** Org de l'utilisateur seulement s'il est owner/admin (sinon null). */
async function resolveOwnerAdminOrgId(userId: string): Promise<string | null> {
  const admin = supabaseAdmin();
  const { data: member } = await admin
    .schema('app')
    .from('members')
    .select('organization_id, role')
    .eq('user_id', userId)
    .is('deleted_at', null)
    .order('is_default_org', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!member?.organization_id) return null;
  if (!OWNER_ADMIN_ROLES.includes(member.role as (typeof OWNER_ADMIN_ROLES)[number])) return null;
  return member.organization_id;
}

function mapRpcError(code: string | undefined): ErrCode {
  switch (code) {
    case 'P0401':
      return 'forbidden_not_admin';
    case 'P0409':
      return 'active_dossier_exists';
    default:
      return 'not_found';
  }
}

async function removeBlobs(bucket: string, paths: string[]): Promise<void> {
  if (paths.length === 0) return;
  try {
    const { error } = await supabaseAdmin().storage.from(bucket).remove(paths);
    if (error) console.error(`[rgpd] storage.remove ${bucket} échec:`, error.message);
  } catch (e) {
    console.error(`[rgpd] storage.remove ${bucket} exception:`, e);
  }
}

export const anonymizeLearner = authActionClient
  .schema(AnonymizeLearnerSchema)
  .action(async ({ parsedInput, ctx }): Promise<AnonymizeResult> => {
    const orgId = await resolveOwnerAdminOrgId(ctx.userId as unknown as string);
    if (!orgId) return { ok: false, error: 'forbidden_not_admin' };

    const { data: learner } = await ctx.supabase
      .schema('app')
      .from('learners')
      .select('last_name')
      .eq('id', parsedInput.learnerId)
      .is('deleted_at', null)
      .maybeSingle();
    if (!learner) return { ok: false, error: 'not_found' };
    if (!namesMatch(parsedInput.confirmName, learner.last_name)) {
      return { ok: false, error: 'name_mismatch' };
    }

    const { data, error } = await ctx.supabase
      .schema('app')
      .rpc('anonymize_learner' as never, { p_learner_id: parsedInput.learnerId } as never);
    if (error) return { ok: false, error: mapRpcError(error.code) };

    const result = data as { status: 'anonymized' | 'already_anonymized'; storage_paths?: string[] };
    if (result.status === 'anonymized') {
      await removeBlobs('learner-submissions', result.storage_paths ?? []);
    }
    revalidatePath('/apprenants');
    return { ok: true, status: result.status };
  });

export const anonymizeProspect = authActionClient
  .schema(AnonymizeProspectSchema)
  .action(async ({ parsedInput, ctx }): Promise<AnonymizeResult> => {
    const orgId = await resolveOwnerAdminOrgId(ctx.userId as unknown as string);
    if (!orgId) return { ok: false, error: 'forbidden_not_admin' };

    const { data: prospect } = await ctx.supabase
      .schema('app')
      .from('prospects')
      .select('last_name')
      .eq('id', parsedInput.prospectId)
      .is('deleted_at', null)
      .maybeSingle();
    if (!prospect) return { ok: false, error: 'not_found' };
    if (!namesMatch(parsedInput.confirmName, prospect.last_name)) {
      return { ok: false, error: 'name_mismatch' };
    }

    const { data, error } = await ctx.supabase
      .schema('app')
      .rpc('anonymize_prospect' as never, { p_prospect_id: parsedInput.prospectId } as never);
    if (error) return { ok: false, error: mapRpcError(error.code) };

    const result = data as { status: 'anonymized' | 'already_anonymized'; storage_paths?: string[] };
    if (result.status === 'anonymized') {
      await removeBlobs('prospect-documents', result.storage_paths ?? []);
    }
    revalidatePath('/prospects');
    return { ok: true, status: result.status };
  });
