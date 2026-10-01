'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { createClient } from '@supabase/supabase-js';
import { env } from '@/env.mjs';
import { guardAction } from '@/shared/lib/auth/guard-action';

/**
 * Le nom du dossier, choisi sur sa fiche (0201).
 *
 * Il se déduisait seul — le stagiaire titulaire, à défaut le référent ou
 * l'entreprise. Une affaire d'entreprise portait ainsi le nom d'un salarié,
 * alors qu'on la cherche par celui de la société. Vide = retour au nom déduit.
 */

const admin = () =>
  createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

export type NomResult = { ok: true } | { ok: false; error: string };

const Schema = z.object({
  dossierId: z.string().uuid(),
  nom: z.string().trim().max(120, 'Le nom ne peut dépasser 120 caractères.'),
});

export async function renommerDossier(brut: z.input<typeof Schema>): Promise<NomResult> {
  const garde = await guardAction('dossiers');
  if (!garde.ok) return { ok: false, error: garde.error };
  const p = Schema.safeParse(brut);
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? 'Saisie invalide.' };

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
    .update({ nom: p.data.nom || null, updated_at: new Date().toISOString() } as never)
    .eq('id', p.data.dossierId);
  if (error) {
    console.error('[dossier] nom non enregistré', p.data.dossierId, error.message);
    return { ok: false, error: 'Le nom n’a pas pu être enregistré.' };
  }

  revalidatePath(`/dossiers/${p.data.dossierId}`, 'layout');
  revalidatePath('/dossiers');
  return { ok: true };
}
