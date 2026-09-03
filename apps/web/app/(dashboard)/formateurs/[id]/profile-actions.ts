'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireAccess } from '@/shared/lib/auth/require-access';
import { supabaseServer } from '@/shared/lib/supabase/server';
import { supabaseAdmin } from '@/shared/lib/supabase/admin';
import { sendTrainerInvite } from '@/features/trainers/send-trainer-invite';
import { TrainerIdentitySchema, type TrainerIdentityInput } from './identity-schema';
import { getCurrentMember } from '@/shared/lib/auth/current-member';

type Result = { ok: true } | { ok: false; error: string };

/**
 * Édition complète de la fiche formateur. L'e-mail sert de clé de rattachement
 * au compte : le modifier ne renomme pas le compte Supabase existant — il faut
 * renvoyer une invitation à la nouvelle adresse (bouton dédié).
 */
export async function updateTrainerIdentity(
  trainerId: string,
  input: TrainerIdentityInput,
): Promise<Result> {
  await requireAccess('dossiers', 'manage');

  const parsed = TrainerIdentitySchema.safeParse(input);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return { ok: false, error: first?.message ?? 'Champs invalides.' };
  }

  const sb = supabaseServer();
  const { data, error } = await sb
    .schema('app')
    .from('trainers')
    .update({
      first_name: parsed.data.firstName,
      last_name: parsed.data.lastName,
      email: parsed.data.email.toLowerCase(),
      phone: parsed.data.phone || null,
      is_internal: parsed.data.isInternal,
      siret: parsed.data.siret || null,
      nda: parsed.data.nda || null,
      zoom_url: parsed.data.zoomUrl || null,
      specialties: parsed.data.specialties,
    } as never)
    .eq('id', trainerId)
    .is('deleted_at', null)
    .select('id');

  if (error) return { ok: false, error: error.message };
  // 0 ligne = bloqué par la RLS (pas administrateur de cet organisme).
  if (!data || (data as unknown[]).length === 0) {
    return { ok: false, error: "Vous n'avez pas les droits pour modifier ce formateur." };
  }

  revalidatePath(`/formateurs/${trainerId}`);
  revalidatePath('/formateurs');
  return { ok: true };
}

/** Renvoie l'invitation « finalisez votre espace » au formateur. */
export async function resendTrainerInvite(trainerId: string): Promise<Result> {
  await requireAccess('dossiers', 'manage');

  const sb = supabaseServer();
  const { data } = await sb
    .schema('app')
    .from('trainers')
    .select('email, first_name, organization_id')
    .eq('id', trainerId)
    .is('deleted_at', null)
    .maybeSingle();

  const trainer = data as { email: string | null; first_name: string | null; organization_id: string } | null;
  if (!trainer?.email) return { ok: false, error: 'Ce formateur n’a pas d’adresse e-mail.' };

  const { data: org } = await supabaseAdmin()
    .schema('app')
    .from('organizations')
    .select('name')
    .eq('id', trainer.organization_id)
    .maybeSingle();

  const res = await sendTrainerInvite({
    email: trainer.email,
    firstName: trainer.first_name ?? '',
    orgName: ((org as { name?: string } | null)?.name) ?? 'votre organisme de formation',
  });
  if (!res.ok) {
    return {
      ok: false,
      error:
        res.reason === 'send_failed'
          ? "L'e-mail n'a pas pu être envoyé (service e-mail non configuré ?)."
          : "Le lien d'invitation n'a pas pu être généré.",
    };
  }
  return { ok: true };
}

/** Met à jour la description (bio) d'un formateur. Staff de l'org (RLS). */
export async function updateTrainerBio(trainerId: string, bio: string): Promise<Result> {
  await requireAccess('dossiers', 'manage');
  const sb = supabaseServer();
  const { error } = await sb
    .schema('app')
    .from('trainers')
    .update({ bio: bio.trim() || null } as never)
    .eq('id', trainerId)
    .is('deleted_at', null);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/formateurs/${trainerId}`);
  revalidatePath('/formateurs');
  return { ok: true };
}

export type SpaceAccessResult = { ok: true; disabled: boolean } | { ok: false; error: string };

/**
 * Ouvre ou ferme l'espace d'un formateur, depuis sa fiche.
 *
 * Réservé aux administrateurs et au propriétaire de l'organisme. La fiche reste
 * intacte : seul l'accès est coupé, et il se rouvre d'un clic (audit CAP-30).
 */
export async function setTrainerSpaceAccess(
  trainerId: string,
  disabled: boolean,
): Promise<SpaceAccessResult> {
  const membre = await getCurrentMember();
  if (!membre) return { ok: false, error: 'Session expirée — reconnectez-vous.' };
  if (membre.role !== 'owner' && membre.role !== 'admin') {
    return { ok: false, error: 'Réservé aux administrateurs.' };
  }

  const sb = supabaseAdmin();
  const { data: moi } = await sb
    .schema('app')
    .from('members')
    .select('id')
    .eq('user_id', membre.userId)
    .eq('organization_id', membre.organizationId)
    .maybeSingle();

  const { error } = await sb
    .schema('app')
    .from('trainers')
    .update({
      space_disabled_at: disabled ? new Date().toISOString() : null,
      space_disabled_by: disabled ? ((moi as { id: string } | null)?.id ?? null) : null,
    } as never)
    .eq('id', trainerId)
    .eq('organization_id', membre.organizationId)
    .is('deleted_at', null);

  if (error) {
    console.error('[formateurs] fermeture de l’espace échouée', error);
    return { ok: false, error: error.message };
  }

  revalidatePath(`/formateurs/${trainerId}`);
  revalidatePath('/formateurs');
  return { ok: true, disabled };
}
