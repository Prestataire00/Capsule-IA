'use server';

import { revalidatePath } from 'next/cache';
import { supabaseServer } from '@/shared/lib/supabase/server';

export type SetPriceResult = { ok: true; priceCents: number | null } | { ok: false; error: string };

// euros (string saisie utilisateur, virgule ou point) -> cents entiers, ou null si vide.
function toCents(input: string): number | null | undefined {
  const trimmed = input.trim();
  if (trimmed === '') return null;
  const normalized = trimmed.replace(/\s/g, '').replace(',', '.');
  const euros = Number(normalized);
  if (!Number.isFinite(euros) || euros < 0) return undefined; // invalide
  return Math.round(euros * 100);
}

export async function setModulePrice(moduleId: string, eurosInput: string): Promise<SetPriceResult> {
  if (!moduleId) return { ok: false, error: 'missing_module' };
  const cents = toCents(eurosInput);
  if (cents === undefined) return { ok: false, error: 'invalid_price' };

  const sb = supabaseServer();
  // RLS : seul le staff de l'organisation propriétaire peut éditer le catalogue.
  const { error } = await sb.schema('app').from('modules').update({ price_cents: cents }).eq('id', moduleId);
  if (error) return { ok: false, error: error.message };

  revalidatePath('/modules');
  return { ok: true, priceCents: cents };
}
