'use server';
// ARCHETYPE: shared
// Server Action : sauvegarde le programme personnalisé d'une formation dans
// metadata.catalog.programme (préserve le reste de metadata). Auth admin +
// scope org, même garde que updateFormation.

import { revalidatePath } from 'next/cache';
import { supabaseAdmin } from '@/shared/lib/supabase/admin';
import { supabaseServer } from '@/shared/lib/supabase/server';
import { programmeSchema } from './schema';

export type SaveProgrammeResult = { ok: true } | { ok: false; error: string; details?: unknown };

const ADMIN_ROLES = ['owner', 'admin', 'gestionnaire'] as const;

async function resolveAdminOrgId(userId: string): Promise<string | null> {
  const admin = supabaseAdmin();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: member } = await (admin as any)
    .schema('app')
    .from('members')
    .select('organization_id, role')
    .eq('user_id', userId)
    .is('deleted_at', null)
    .order('is_default_org', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!member?.organization_id) return null;
  if (!ADMIN_ROLES.includes(member.role)) return null;
  return member.organization_id as string;
}

export async function saveProgramme(formationId: string, programme: unknown): Promise<SaveProgrammeResult> {
  const supabase = supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'unauthenticated' };

  const orgId = await resolveAdminOrgId(user.id);
  if (!orgId) return { ok: false, error: 'forbidden_not_admin' };

  const parsed = programmeSchema.safeParse(programme);
  if (!parsed.success) return { ok: false, error: 'invalid_input', details: parsed.error.flatten() };

  const admin = supabaseAdmin();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: existing } = await (admin as any)
    .schema('app')
    .from('formations')
    .select('id, metadata')
    .eq('id', formationId)
    .eq('organization_id', orgId)
    .is('deleted_at', null)
    .maybeSingle();
  if (!existing) return { ok: false, error: 'not_found' };

  const currentMeta = (existing.metadata ?? {}) as Record<string, unknown>;
  const currentCatalog = (currentMeta.catalog ?? {}) as Record<string, unknown>;
  const nextMetadata = {
    ...currentMeta,
    catalog: { ...currentCatalog, programme: parsed.data },
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (admin as any)
    .schema('app')
    .from('formations')
    .update({ metadata: nextMetadata, updated_by: user.id })
    .eq('id', formationId)
    .eq('organization_id', orgId);

  if (error) return { ok: false, error: 'db_update_failed', details: error.message };

  revalidatePath(`/formations/${formationId}`);
  revalidatePath(`/formations/${formationId}/programme`);
  revalidatePath(`/catalogue/${formationId}`);
  return { ok: true };
}
