'use server';

import { revalidatePath } from 'next/cache';
import { supabaseAdmin } from '@/shared/lib/supabase/admin';
import { supabaseServer } from '@/shared/lib/supabase/server';
import { formationFormSchema } from './formation.schema';
import { toInsert, toUpdate } from './mapping';

export type FormationActionResult =
  | { ok: true; id: string }
  | { ok: false; error: string; details?: unknown };

const ADMIN_ROLES = ['owner', 'admin', 'gestionnaire'] as const;
type AdminRole = (typeof ADMIN_ROLES)[number];

async function resolveAdminOrgId(userId: string): Promise<string | null> {
  const admin = supabaseAdmin();
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
  if (!ADMIN_ROLES.includes(member.role as AdminRole)) return null;
  return member.organization_id as string;
}

/** Postgres unique_violation → code déjà utilisé pour cet OF. */
function isUniqueViolation(err: { code?: string; message?: string } | null): boolean {
  return err?.code === '23505' || /duplicate key|unique/i.test(err?.message ?? '');
}

export async function createFormation(values: unknown): Promise<FormationActionResult> {
  const supabase = supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'unauthenticated' };

  const orgId = await resolveAdminOrgId(user.id);
  if (!orgId) return { ok: false, error: 'forbidden_not_admin' };

  const parsed = formationFormSchema.safeParse(values);
  if (!parsed.success) return { ok: false, error: 'invalid_input', details: parsed.error.flatten() };

  const admin = supabaseAdmin();
  const { data, error } = await (admin as any)
    .schema('app')
    .from('formations')
    .insert(toInsert(parsed.data, { organizationId: orgId, userId: user.id }))
    .select('id')
    .single();

  if (error || !data) {
    if (isUniqueViolation(error)) return { ok: false, error: 'code_already_exists' };
    return { ok: false, error: 'db_insert_failed', details: error?.message };
  }

  revalidatePath('/formations');
  return { ok: true, id: data.id as string };
}

export async function updateFormation(id: string, values: unknown): Promise<FormationActionResult> {
  const supabase = supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'unauthenticated' };

  const orgId = await resolveAdminOrgId(user.id);
  if (!orgId) return { ok: false, error: 'forbidden_not_admin' };

  const parsed = formationFormSchema.safeParse(values);
  if (!parsed.success) return { ok: false, error: 'invalid_input', details: parsed.error.flatten() };

  const admin = supabaseAdmin();

  // Charge la ligne existante (scopée org) pour préserver les clés metadata hors catalog.
  const { data: existing } = await (admin as any)
    .schema('app')
    .from('formations')
    .select('id, metadata')
    .eq('id', id)
    .eq('organization_id', orgId)
    .is('deleted_at', null)
    .maybeSingle();
  if (!existing) return { ok: false, error: 'not_found' };

  const { error } = await (admin as any)
    .schema('app')
    .from('formations')
    .update(toUpdate(parsed.data, { userId: user.id }, existing.metadata ?? null))
    .eq('id', id)
    .eq('organization_id', orgId);

  if (error) {
    if (isUniqueViolation(error)) return { ok: false, error: 'code_already_exists' };
    return { ok: false, error: 'db_update_failed', details: error.message };
  }

  revalidatePath('/formations');
  revalidatePath(`/formations/${id}`);
  return { ok: true, id };
}
