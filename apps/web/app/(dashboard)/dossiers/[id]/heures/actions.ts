'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@supabase/supabase-js';
import { env } from '@/env.mjs';

const admin = () =>
  createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

type ActionResult = { ok: true } | { ok: false; error: string };

async function recompute(sb: ReturnType<typeof admin>, dossierId: string): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (sb as any).rpc('recompute_dossier_hours', { p_dossier_id: dossierId });
}

export async function markDossierAbandoned(
  dossierId: string, date: string, reason: string,
): Promise<ActionResult> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { ok: false, error: 'Date invalide' };
  const sb = admin();
  const { error } = await sb.schema('app').from('dossiers')
    .update({ abandoned_at: date, abandon_reason: reason, updated_at: new Date().toISOString() })
    .eq('id', dossierId);
  if (error) return { ok: false, error: error.message };
  await recompute(sb, dossierId);
  revalidatePath(`/dossiers/${dossierId}/heures`);
  return { ok: true };
}

export async function recomputeHoursNow(dossierId: string): Promise<ActionResult> {
  const sb = admin();
  await recompute(sb, dossierId);
  revalidatePath(`/dossiers/${dossierId}/heures`);
  return { ok: true };
}
