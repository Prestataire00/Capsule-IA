'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getCurrentMember } from '@/shared/lib/auth/current-member';
import { can } from '@/shared/lib/auth/permissions';
import { supabaseAdmin } from '@/shared/lib/supabase/admin';

/**
 * Confier un dossier à un formateur, ou le lui retirer.
 *
 * Le rattachement (`app.dossier_trainers`) est ce qui ouvre au formateur, via
 * `my_trainer_dossier_ids` (0150), la lecture du dossier, de ses apprenants et
 * de ses séances dans son espace. Rien de financier ne lui devient visible :
 * son espace n'interroge jamais ces colonnes.
 *
 * Écriture en service role, donc rôle et organisation vérifiés explicitement.
 */

type Result = { ok: true } | { ok: false; error: string };

const schema = z.object({ dossierId: z.string().uuid(), trainerId: z.string().uuid() });

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const admin = () => supabaseAdmin() as unknown as SupabaseClient<any, any, any>;

async function garde(input: z.infer<typeof schema>): Promise<{ ok: true; organizationId: string } | { ok: false; error: string }> {
  const membre = await getCurrentMember();
  if (!membre) return { ok: false, error: 'Session expirée — reconnectez-vous.' };
  if (can(membre.role, 'dossiers') !== 'manage') {
    return { ok: false, error: 'Votre rôle ne permet pas de confier un dossier.' };
  }

  const sb = admin();
  const [{ data: dossier }, { data: formateur }] = await Promise.all([
    sb
      .schema('app')
      .from('dossiers')
      .select('id')
      .eq('id', input.dossierId)
      .eq('organization_id', membre.organizationId)
      .is('deleted_at', null)
      .maybeSingle(),
    sb
      .schema('app')
      .from('trainers')
      .select('id')
      .eq('id', input.trainerId)
      .eq('organization_id', membre.organizationId)
      .is('deleted_at', null)
      .maybeSingle(),
  ]);
  if (!dossier) return { ok: false, error: 'Dossier introuvable.' };
  if (!formateur) return { ok: false, error: 'Ce formateur n’appartient pas à votre organisme.' };
  return { ok: true, organizationId: membre.organizationId };
}

export async function confierDossier(input: { dossierId: string; trainerId: string }): Promise<Result> {
  const p = schema.safeParse(input);
  if (!p.success) return { ok: false, error: 'Saisie invalide.' };
  const g = await garde(p.data);
  if (!g.ok) return g;

  // Premier formateur rattaché = référent pédagogique du dossier.
  const { count } = await admin()
    .schema('app')
    .from('dossier_trainers')
    .select('trainer_id', { count: 'exact', head: true })
    .eq('dossier_id', p.data.dossierId);

  const { error } = await admin()
    .schema('app')
    .from('dossier_trainers')
    .upsert(
      {
        dossier_id: p.data.dossierId,
        trainer_id: p.data.trainerId,
        organization_id: g.organizationId,
        is_lead: (count ?? 0) === 0,
      } as never,
      { onConflict: 'dossier_id,trainer_id' },
    );
  if (error) {
    console.error('[dossier] formateur non rattaché', error.message);
    // Panne connue : l'audit générique lisait `NEW.id`, absent de cette table
    // (corrigé par la migration 0168).
    if (/has no field "id"/.test(error.message)) {
      return {
        ok: false,
        error: 'Rattachement bloqué par l’audit de la base : appliquez la migration 0168, puis réessayez.',
      };
    }
    return { ok: false, error: 'Le formateur n’a pas pu être rattaché.' };
  }

  revalidatePath(`/dossiers/${p.data.dossierId}/formateurs`);
  revalidatePath(`/dossiers/${p.data.dossierId}`);
  return { ok: true };
}

export async function retirerDossier(input: { dossierId: string; trainerId: string }): Promise<Result> {
  const p = schema.safeParse(input);
  if (!p.success) return { ok: false, error: 'Saisie invalide.' };
  const g = await garde(p.data);
  if (!g.ok) return g;

  const { error } = await admin()
    .schema('app')
    .from('dossier_trainers')
    .delete()
    .eq('dossier_id', p.data.dossierId)
    .eq('trainer_id', p.data.trainerId)
    .eq('organization_id', g.organizationId);
  if (error) {
    console.error('[dossier] formateur non retiré', error.message);
    return { ok: false, error: 'Le formateur n’a pas pu être retiré.' };
  }

  revalidatePath(`/dossiers/${p.data.dossierId}/formateurs`);
  revalidatePath(`/dossiers/${p.data.dossierId}`);
  return { ok: true };
}
