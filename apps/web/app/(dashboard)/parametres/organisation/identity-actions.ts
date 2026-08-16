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
    let orgId: string;
    try {
      orgId = await resolveOrgId(ctx);
    } catch {
      return { ok: false as const, error: 'organization_not_found' as const };
    }

    const { data, error } = await ctx.supabase
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
        vat_regime: parsedInput.vatRegime,
        // Un organisme exonéré ne conserve pas de taux résiduel.
        default_vat_rate: parsedInput.vatRegime === 'subject' ? parsedInput.defaultVatRate : 0,
      } as never)
      .eq('id', orgId)
      .select('id');

    // Vraie erreur SQL (contrainte, colonne, trigger…) → remontée telle quelle.
    if (error) {
      console.error('[updateOrgIdentity] db error', error);
      return { ok: false as const, error: 'db_error' as const, details: error.message };
    }
    // 0 ligne modifiée = bloqué par la RLS : l'utilisateur n'est pas
    // administrateur/propriétaire de cet organisme (seuls owner/admin peuvent).
    if (!data || (data as unknown[]).length === 0) {
      return { ok: false as const, error: 'forbidden' as const };
    }

    revalidatePath('/parametres/organisation');
    return { ok: true as const };
  });
