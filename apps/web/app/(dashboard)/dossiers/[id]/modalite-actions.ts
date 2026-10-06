'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { createClient } from '@supabase/supabase-js';
import { env } from '@/env.mjs';
import { guardAction } from '@/shared/lib/auth/guard-action';
import { ModalitiesSchema, derivePrimaryModality } from '@/features/dossier/modality-set';

/**
 * La modalité du dossier, modifiable sur sa fiche (point Capsule IA du
 * 05/10/2026). Elle ne se choisissait qu'à la création ; c'est elle que
 * lisent la convention et les attestations. La première de la liste est la
 * modalité principale. Les séances gardent chacune la leur.
 */

const admin = () =>
  createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

export type ModaliteResult = { ok: true } | { ok: false; error: string };

const Schema = z.object({ dossierId: z.string().uuid(), modalites: ModalitiesSchema });

export async function modifierModaliteDossier(brut: z.input<typeof Schema>): Promise<ModaliteResult> {
  const garde = await guardAction('dossiers');
  if (!garde.ok) return { ok: false, error: garde.error };
  const p = Schema.safeParse(brut);
  if (!p.success) return { ok: false, error: 'Choisissez au moins une modalité.' };
  const modalites = [...new Set(p.data.modalites)];

  const sb = admin();
  const { data: existant } = await sb
    .schema('app')
    .from('dossiers')
    .select('id')
    .eq('id', p.data.dossierId)
    .eq('organization_id', garde.member.organizationId)
    .is('deleted_at', null)
    .maybeSingle();
  if (!existant) return { ok: false, error: 'Dossier introuvable.' };

  const { error } = await sb
    .schema('app')
    .from('dossiers')
    .update({ modality: derivePrimaryModality(modalites), modalities: modalites, updated_at: new Date().toISOString() } as never)
    .eq('id', p.data.dossierId);
  if (error) {
    console.error('[dossier] modalité non enregistrée', p.data.dossierId, error.message);
    return { ok: false, error: 'La modalité n’a pas pu être enregistrée.' };
  }

  revalidatePath(`/dossiers/${p.data.dossierId}`, 'layout');
  revalidatePath('/dossiers');
  return { ok: true };
}
