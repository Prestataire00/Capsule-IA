'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { createClient } from '@supabase/supabase-js';
import { env } from '@/env.mjs';
import { guardAction } from '@/shared/lib/auth/guard-action';

/**
 * Les heures du dossier, corrigées sur sa fiche.
 *
 * Elles se posaient à la création — somme des modules, 1 h à défaut — et ne
 * bougeaient plus. Une formation sur mesure n'ayant pas de module, la
 * convention imprimait « 1 h » pour un parcours de 20 h, sans aucun écran pour
 * la reprendre. C'est ce chiffre que lisent la convention, les attestations et
 * le suivi des heures.
 */

const admin = () =>
  createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

export type HeuresResult = { ok: true } | { ok: false; error: string };

const Schema = z.object({
  dossierId: z.string().uuid(),
  /** Saisi comme on l'écrit : « 18 », « 3,5 ». */
  heures: z.string().trim().min(1, 'Indiquez un nombre d’heures.').max(10),
});

export async function modifierHeuresDossier(brut: z.input<typeof Schema>): Promise<HeuresResult> {
  const garde = await guardAction('dossiers');
  if (!garde.ok) return { ok: false, error: garde.error };
  const p = Schema.safeParse(brut);
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? 'Saisie invalide.' };

  const heures = Number(p.data.heures.replace(/\s/g, '').replace(',', '.'));
  if (!Number.isFinite(heures) || heures <= 0 || heures > 2000) {
    return { ok: false, error: 'Nombre d’heures invalide — écrivez par exemple 18 ou 3,5.' };
  }

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
    .update({ total_hours: Math.round(heures * 100) / 100, updated_at: new Date().toISOString() } as never)
    .eq('id', p.data.dossierId);
  if (error) {
    console.error('[dossier] heures non enregistrées', p.data.dossierId, error.message);
    return { ok: false, error: 'Les heures n’ont pas pu être enregistrées.' };
  }

  revalidatePath(`/dossiers/${p.data.dossierId}`, 'layout');
  revalidatePath('/dossiers');
  return { ok: true };
}
