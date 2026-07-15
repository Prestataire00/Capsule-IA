'use server';

import { revalidatePath } from 'next/cache';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabaseServer } from '@/shared/lib/supabase/server';

export type ExpenseResult = { ok: true } | { ok: false; error: string };

const KINDS = new Set(['salaire_formateur', 'achat_formation', 'sous_traitance_confiee', 'autre']);

/** Ajoute une dépense rattachée au dossier (charges → BPF). */
export async function addDossierExpense(formData: FormData): Promise<ExpenseResult> {
  const dossierId = String(formData.get('dossierId') ?? '');
  const kind = String(formData.get('kind') ?? '');
  if (!dossierId || !KINDS.has(kind)) return { ok: false, error: 'invalid_input' };

  const label = String(formData.get('label') ?? '').trim() || null;
  const supplier = String(formData.get('supplierName') ?? '').trim() || null;
  const incurredOn = String(formData.get('incurredOn') ?? '').trim() || null;

  const amountRaw = String(formData.get('amount') ?? '').replace(/\s/g, '').replace(',', '.');
  const euros = Number.parseFloat(amountRaw);
  const amountCents = Number.isFinite(euros) ? Math.max(0, Math.round(euros * 100)) : 0;

  const hoursRaw = String(formData.get('hours') ?? '').replace(',', '.').trim();
  const hours = hoursRaw && Number.isFinite(Number.parseFloat(hoursRaw)) ? Math.max(0, Number.parseFloat(hoursRaw)) : null;

  const sb = supabaseServer() as unknown as SupabaseClient;
  const { data: d } = await sb.schema('app').from('dossiers').select('organization_id').eq('id', dossierId).maybeSingle();
  const orgId = (d as { organization_id?: string } | null)?.organization_id;
  if (!orgId) return { ok: false, error: 'dossier_introuvable' };

  const { error } = await sb.schema('app').from('dossier_expenses').insert({
    organization_id: orgId,
    dossier_id: dossierId,
    kind,
    label,
    amount_cents: amountCents,
    hours,
    supplier_name: supplier,
    incurred_on: incurredOn,
  } as never);
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/dossiers/${dossierId}`);
  return { ok: true };
}

/** Supprime (soft-delete) une dépense. */
export async function deleteDossierExpense(dossierId: string, expenseId: string): Promise<ExpenseResult> {
  if (!dossierId || !expenseId) return { ok: false, error: 'invalid_input' };
  const sb = supabaseServer() as unknown as SupabaseClient;
  const { error } = await sb
    .schema('app')
    .from('dossier_expenses')
    .update({ deleted_at: new Date().toISOString() } as never)
    .eq('id', expenseId)
    .eq('dossier_id', dossierId);
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/dossiers/${dossierId}`);
  return { ok: true };
}
