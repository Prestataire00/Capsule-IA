'use server';

import { revalidatePath } from 'next/cache';
import { supabaseAdmin } from '@/shared/lib/supabase/admin';
import { supabaseServer } from '@/shared/lib/supabase/server';
import { slugify } from './mapping';
import { bespokeFormationSchema } from './bespoke';

export type BespokeResult =
  | { ok: true; id: string }
  | { ok: false; error: string; details?: unknown };

const ADMIN_ROLES = ['owner', 'admin', 'gestionnaire'] as const;

async function resolveAdminOrgId(userId: string): Promise<string | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: member } = await (supabaseAdmin() as any)
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

/** Code court et lisible, propre aux formations sur mesure : SM-2026-4F2A. */
function codeSurMesure(): string {
  const suffixe = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `SM-${new Date().getFullYear()}-${suffixe}`;
}

/**
 * Crée une formation sur mesure rattachée à un client (entreprise ou
 * particulier) au tarif fixé par l'organisme. Elle n'est pas publiée : elle
 * n'apparaît donc pas au catalogue public, seulement sur la fiche du client et
 * dans la liste des formations, marquée « sur mesure ».
 */
export async function createBespokeFormation(values: unknown): Promise<BespokeResult> {
  const supabase = supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'unauthenticated' };

  const orgId = await resolveAdminOrgId(user.id);
  if (!orgId) return { ok: false, error: 'forbidden_not_admin' };

  const parsed = bespokeFormationSchema.safeParse(values);
  if (!parsed.success) return { ok: false, error: 'invalid_input', details: parsed.error.flatten() };
  const v = parsed.data;

  // Le client doit appartenir à l'organisation : sans cette vérification, un id
  // d'un autre organisme passerait (l'insertion se fait en service_role).
  const table = v.clientKind === 'company' ? 'companies' : 'learners';
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = supabaseAdmin() as any;
  const { data: client } = await admin
    .schema('app')
    .from(table)
    .select('id')
    .eq('id', v.clientId)
    .eq('organization_id', orgId)
    .is('deleted_at', null)
    .maybeSingle();
  if (!client) return { ok: false, error: 'client_not_found' };

  const base = {
    organization_id: orgId,
    title: v.title,
    summary: v.summary && v.summary.length > 0 ? v.summary : null,
    default_duration_hours: v.durationHours,
    default_modality: v.modality,
    default_price_cents: Math.round(v.priceEuros * 100),
    is_published: false,
    objectives: [] as string[],
    prerequisites: [] as string[],
    created_by: user.id,
    updated_by: user.id,
    client_kind: v.clientKind,
    client_company_id: v.clientKind === 'company' ? v.clientId : null,
    client_learner_id: v.clientKind === 'individual' ? v.clientId : null,
  };

  // Le code est unique par organisme : on retente une fois si le tirage tombe
  // sur un code déjà pris.
  let lastError: { code?: string; message?: string } | null = null;
  for (let essai = 0; essai < 3; essai += 1) {
    const code = codeSurMesure();
    const { data, error } = await admin
      .schema('app')
      .from('formations')
      .insert({ ...base, code, slug: slugify(code) })
      .select('id')
      .single();
    if (!error && data) {
      revalidatePath('/formations');
      if (v.clientKind === 'company') revalidatePath(`/entreprises/${v.clientId}`);
      else revalidatePath(`/apprenants/${v.clientId}`);
      return { ok: true, id: data.id as string };
    }
    lastError = error;
    const conflit = error?.code === '23505' || /duplicate key|unique/i.test(error?.message ?? '');
    if (!conflit) break;
  }

  // Colonnes absentes : la migration 0162 n'est pas encore appliquée.
  if (/client_kind|client_company_id|client_learner_id/.test(lastError?.message ?? '')) {
    return { ok: false, error: 'migration_manquante' };
  }
  return { ok: false, error: 'db_insert_failed', details: lastError?.message };
}
