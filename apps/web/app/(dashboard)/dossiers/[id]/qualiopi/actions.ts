'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@supabase/supabase-js';
import { env } from '@/env.mjs';

const admin = () =>
  createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

type ActionResult = { ok: true } | { ok: false; error: string };

// Traduit l'exception SQL du gate en message lisible.
function explainGateError(message: string | undefined): string {
  if (!message) return 'Transition refusée.';
  if (message.includes('qualiopi_entry_blocked')) {
    const m = message.split('qualiopi_entry_blocked:')[1]?.trim();
    return `Démarrage bloqué : indicateurs Qualiopi d'entrée manquants (${m ?? '—'}).`;
  }
  if (message.includes('qualiopi_closing_blocked')) {
    const m = message.split('qualiopi_closing_blocked:')[1]?.trim();
    return `Clôture bloquée : indicateurs Qualiopi de clôture manquants (${m ?? '—'}).`;
  }
  return message;
}

async function transition(dossierId: string, to: 'active' | 'closed'): Promise<ActionResult> {
  const sb = admin();
  const { error } = await sb
    .schema('app')
    .from('dossiers')
    .update({ status: to, updated_at: new Date().toISOString() })
    .eq('id', dossierId);
  if (error) return { ok: false, error: explainGateError(error.message) };
  revalidatePath(`/dossiers/${dossierId}/qualiopi`);
  return { ok: true };
}

export async function startTraining(dossierId: string): Promise<ActionResult> {
  return transition(dossierId, 'active');
}

export async function closeDossier(dossierId: string): Promise<ActionResult> {
  return transition(dossierId, 'closed');
}

// Recalcul manuel de la checklist (bouton « Recalculer »).
export async function recomputeNow(dossierId: string): Promise<ActionResult> {
  const sb = admin();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (sb as any).rpc('recompute_qualiopi_checklist', { p_dossier_id: dossierId });
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/dossiers/${dossierId}/qualiopi`);
  return { ok: true };
}
