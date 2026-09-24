'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { supabaseAdmin } from '@/shared/lib/supabase/admin';
import { getCurrentMember } from '@/shared/lib/auth/current-member';
import { can } from '@/shared/lib/auth/permissions';

/**
 * Valider ou retirer une étape d'avancement à la main (0194).
 *
 * L'avancement se déduit des données. Quand la preuve vit ailleurs — une
 * convention signée sur papier, un chèque encaissé — le dossier restait bloqué
 * sur une étape pourtant franchie, et l'écran réclamait une action déjà faite.
 *
 * Deux gardes, le rôle et l'organisation : la seconde est vérifiée dans la
 * requête et non chez l'appelant, car une Server Action reçoit un identifiant
 * du client et rien de plus.
 */

export type AvancementResult = { ok: true } | { ok: false; error: string };

const schema = z.object({
  dossierId: z.string().uuid(),
  stepKey: z.string().regex(/^[a-z_]+$/, 'Étape inconnue.'),
  note: z.string().trim().max(500).optional(),
});

type Garde = { ok: true; organizationId: string; userId: string } | { ok: false; error: string };

async function garder(dossierId: string): Promise<Garde> {
  const me = await getCurrentMember();
  if (!me) return { ok: false, error: 'Votre session a expiré, reconnectez-vous.' };
  if (can(me.role, 'dossiers') !== 'manage') {
    return { ok: false, error: "Vous n'avez pas le droit de modifier ce dossier." };
  }

  const { data } = await supabaseAdmin()
    .schema('app')
    .from('dossiers')
    .select('id, organization_id')
    .eq('id', dossierId)
    .maybeSingle();
  const d = data as { organization_id: string } | null;
  if (!d || d.organization_id !== me.organizationId) {
    return { ok: false, error: "Ce dossier n'appartient pas à votre organisation." };
  }
  return { ok: true, organizationId: d.organization_id, userId: me.userId };
}

function messageDeLaBase(message: string): string {
  // La table n'existe pas tant que la 0194 n'est pas jouée : le dire, plutôt
  // que de laisser l'écran muet.
  return /dossier_progress_overrides/.test(message) && /relation|table/i.test(message)
    ? "La base n'est pas à jour (migration 0194) : la validation manuelle n'est pas encore disponible."
    : message;
}

export async function validerEtape(input: {
  dossierId: string;
  stepKey: string;
  note?: string;
}): Promise<AvancementResult> {
  const p = schema.safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? 'Saisie invalide.' };

  // « Dossier créé » est vrai par construction : rien à suppléer.
  if (p.data.stepKey === 'created') {
    return { ok: false, error: 'Cette étape ne se valide pas à la main.' };
  }

  const garde = await garder(p.data.dossierId);
  if (!garde.ok) return garde;

  const { error } = await supabaseAdmin()
    .schema('app')
    .from('dossier_progress_overrides' as never)
    .upsert(
      {
        organization_id: garde.organizationId,
        dossier_id: p.data.dossierId,
        step_key: p.data.stepKey,
        note: p.data.note?.trim() || null,
        validated_by: garde.userId,
        validated_at: new Date().toISOString(),
      } as never,
      { onConflict: 'dossier_id,step_key' },
    );
  if (error) return { ok: false, error: messageDeLaBase(error.message) };

  revalidatePath(`/dossiers/${p.data.dossierId}`);
  return { ok: true };
}

/** Retire la validation manuelle : l'étape repasse au constat seul. */
export async function retirerValidationEtape(input: {
  dossierId: string;
  stepKey: string;
}): Promise<AvancementResult> {
  const p = schema.safeParse(input);
  if (!p.success) return { ok: false, error: 'Saisie invalide.' };

  const garde = await garder(p.data.dossierId);
  if (!garde.ok) return garde;

  const { error } = await supabaseAdmin()
    .schema('app')
    .from('dossier_progress_overrides' as never)
    .delete()
    .eq('dossier_id', p.data.dossierId)
    .eq('step_key', p.data.stepKey);
  if (error) return { ok: false, error: messageDeLaBase(error.message) };

  revalidatePath(`/dossiers/${p.data.dossierId}`);
  return { ok: true };
}
