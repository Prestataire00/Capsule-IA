'use server';

import { revalidatePath } from 'next/cache';
import { authActionClient } from '@/shared/lib/safe-action';
import type { AuthCtx } from '@/shared/lib/safe-action';
import { OrgIdentitySchema } from './identity-schema';

// `authActionClient` n'injecte pas l'org : on la résout depuis `members`
// (RLS-scopé sur l'utilisateur courant), org par défaut en tête.
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

const orNull = (v: string | undefined): string | null => {
  const trimmed = v?.trim();
  return trimmed ? trimmed : null;
};

export const updateOrgIdentityAction = authActionClient
  .schema(OrgIdentitySchema)
  .action(async ({ parsedInput, ctx }) => {
    const orgId = await resolveOrgId(ctx);
    const { error } = await ctx.supabase
      .schema('app')
      .from('organizations')
      // representative_* absents des types générés (migration en attente de db:types).
      .update({
        name: parsedInput.name.trim(),
        legal_name: orNull(parsedInput.legalName),
        siret: orNull(parsedInput.siret),
        declaration_activite: orNull(parsedInput.declarationActivite),
        contact_email: orNull(parsedInput.contactEmail),
        contact_phone: orNull(parsedInput.contactPhone),
        address: {
          line1: orNull(parsedInput.address.line1),
          postal_code: orNull(parsedInput.address.postalCode),
          city: orNull(parsedInput.address.city),
        },
        representative_name: orNull(parsedInput.representativeName),
        representative_title: orNull(parsedInput.representativeTitle),
      } as never)
      .eq('id', orgId);
    if (error) throw new Error(`update_identity_failed: ${error.message}`);
    revalidatePath('/parametres/organisation');
    return { ok: true };
  });
