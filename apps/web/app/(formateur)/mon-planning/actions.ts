'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { supabaseServer } from '@/shared/lib/supabase/server';
import { SupabaseMembershipReader } from '@/features/identity/trainer-self/infrastructure/supabase-membership.reader';
import { CRENEAUX, DISPOS } from '@/features/trainer-space/availability';
import { declarerDisponibilite, effacerJour } from '@/features/trainer-space/availability-store';

/**
 * Le formateur déclare ses jours.
 *
 * La fiche visée n'est jamais celle que le client envoie : elle est reprise
 * dans la liste des fiches du compte connecté. Un identifiant de fiche glissé
 * dans la requête ne permet donc pas de poser des congés au nom d'un collègue.
 */

const schema = z.object({
  trainerId: z.string().uuid(),
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  creneau: z.enum(CRENEAUX),
  kind: z.enum(DISPOS).nullable(),
  note: z.string().trim().max(500).optional(),
});

export type DispoResult = { ok: true } | { ok: false; error: string };

export async function declarerMaDisponibilite(input: {
  trainerId: string;
  day: string;
  creneau: (typeof CRENEAUX)[number];
  /** `null` efface la journée : le formateur repasse en « non renseigné ». */
  kind: (typeof DISPOS)[number] | null;
  note?: string;
}): Promise<DispoResult> {
  const p = schema.safeParse(input);
  if (!p.success) return { ok: false, error: 'Saisie invalide.' };

  const fiches = await new SupabaseMembershipReader(supabaseServer() as never).list();
  const fiche = fiches.find((m) => m.trainerId === p.data.trainerId);
  if (!fiche) return { ok: false, error: "Cette fiche formateur n'est pas la vôtre." };

  const ok = p.data.kind
    ? await declarerDisponibilite({
        organizationId: fiche.organizationId,
        trainerId: fiche.trainerId,
        day: p.data.day,
        creneau: p.data.creneau,
        kind: p.data.kind,
        note: p.data.note ?? null,
      })
    : await effacerJour(fiche.trainerId, p.data.day);
  if (!ok) return { ok: false, error: "La déclaration n'a pas été enregistrée." };

  revalidatePath('/mon-planning');
  return { ok: true };
}
