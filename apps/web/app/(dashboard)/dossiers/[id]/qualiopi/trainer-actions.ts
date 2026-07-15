'use server';
// ARCHETYPE: command
// Affectation d'un formateur à un dossier EXISTANT (impossible auparavant : seule
// la création de dossier le permettait). Débloque l'indicateur Qualiopi I21.
// Le trigger app.dossier_trainers recalcule la checklist automatiquement.

import { revalidatePath } from 'next/cache';
import { createClient } from '@supabase/supabase-js';
import { env } from '@/env.mjs';

const admin = () =>
  createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

type Result = { ok: true } | { ok: false; error: string };

export async function assignDossierTrainer(dossierId: string, trainerId: string): Promise<Result> {
  if (!trainerId) return { ok: false, error: 'no_trainer' };
  const sb = admin();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: d } = await (sb as any)
    .schema('app').from('dossiers').select('organization_id').eq('id', dossierId).maybeSingle();
  if (!d) return { ok: false, error: 'dossier_not_found' };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (sb as any)
    .schema('app').from('dossier_trainers')
    .upsert(
      { dossier_id: dossierId, trainer_id: trainerId, organization_id: d.organization_id, is_lead: true },
      { onConflict: 'dossier_id,trainer_id' },
    );
  if (error) return { ok: false, error: error.message };

  // Filet : recalcule la checklist (le trigger le fait déjà, mais on force le snapshot).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (sb as any).rpc('recompute_qualiopi_checklist', { p_dossier_id: dossierId });

  revalidatePath(`/dossiers/${dossierId}/qualiopi`);
  revalidatePath(`/dossiers/${dossierId}`);
  return { ok: true };
}
