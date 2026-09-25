'use server';

import { revalidatePath } from 'next/cache';
import {
  indicateursDeLEtape,
  titreDeLaPreuve,
  descriptionDeLaPreuve,
} from '@/features/dossier/avancement-qualiopi';

/**
 * Le libellé de l'étape, tel qu'il s'affiche dans l'avancement.
 *
 * Recopié plutôt qu'importé : `load-progress` est un module serveur lourd, et
 * la preuve n'a besoin que du mot. Un libellé qui change ici ne change rien au
 * calcul — seulement le titre d'une preuve déjà déposée.
 */
const LIBELLES_ETAPE: Record<string, string> = {
  needs: 'Analyse du besoin',
  done: 'Formation réalisée',
};
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

  // Ce que l'étape prouve, côté Qualiopi. Sans cela, valider « Analyse du
  // besoin reçue » parce qu'elle s'est faite au téléphone laissait l'onglet
  // Qualiopi réclamer le questionnaire : deux écrans, deux vérités.
  await poserLesPreuves(garde.organizationId, p.data.dossierId, p.data.stepKey, p.data.note ?? null);

  revalidatePath(`/dossiers/${p.data.dossierId}`);
  revalidatePath(`/dossiers/${p.data.dossierId}/qualiopi`);
  return { ok: true };
}

/**
 * Dépose une preuve Qualiopi pour chaque indicateur que l'étape couvre.
 *
 * Elle dit d'où elle vient — `metadata.source`, l'étape, le motif —, ce qui la
 * distingue d'une pièce déposée par l'organisme. Un auditeur doit pouvoir voir
 * qu'elle est déclarative.
 *
 * L'échec ne fait pas échouer la validation : l'étape est franchie, le lien
 * Qualiopi est un bonus. Bloquer l'un sur l'autre priverait d'un geste utile
 * pour une raison qui ne le concerne pas.
 */
async function poserLesPreuves(
  organizationId: string,
  dossierId: string,
  stepKey: string,
  note: string | null,
): Promise<void> {
  const numeros = indicateursDeLEtape(stepKey);
  if (numeros.length === 0) return;

  const sb = supabaseAdmin();
  // Deux référentiels actifs cohabitent — v9 jusqu'au 31/10/2026, v10 ensuite —
  // et un même numéro existe dans les deux. On dépose la preuve sur CHAQUE
  // version active : ne viser que la plus récente laisserait l'indicateur
  // insatisfait tant que le calcul s'appuie encore sur v9, et l'écran
  // continuerait de réclamer ce qu'on vient de valider.
  //
  // L'ancien jeu (« legacy »), mal numéroté, est écarté : son indicateur 4
  // parle d'autre chose (audit CAP-35). Il est inactif, la garde est donc
  // double — et c'est voulu : une réactivation malheureuse ne doit pas faire
  // porter la preuve sur le mauvais texte.
  const { data: refs } = await sb
    .schema('app')
    .from('qualiopi_indicators')
    .select('id, number')
    .eq('scope', 'dossier')
    .eq('is_active', true)
    .neq('referential_version' as never, 'legacy' as never)
    .in('number', numeros as number[]);
  const indicateurs = (refs ?? []) as Array<{ id: string; number: number }>;
  if (indicateurs.length === 0) return;

  // On retire puis on repose, au lieu d'un `upsert` : `qualiopi_proofs` n'a
  // aucune contrainte d'unicité sur (dossier, indicateur), et un `ON CONFLICT`
  // sans index correspondant échoue à l'exécution — une erreur qui ne se serait
  // vue qu'en production. Revalider une étape mise à jour ainsi son motif.
  await retirerLesPreuves(dossierId, stepKey);

  const maintenant = new Date();
  const { error } = await sb
    .schema('app')
    .from('qualiopi_proofs')
    .insert(
      indicateurs.map((i) => ({
        organization_id: organizationId,
        indicator_id: i.id,
        scope: 'dossier' as const,
        dossier_id: dossierId,
        title: titreDeLaPreuve(LIBELLES_ETAPE[stepKey] ?? stepKey),
        description: descriptionDeLaPreuve(note, maintenant),
        metadata: { source: 'avancement_manuel', step_key: stepKey },
      })) as never,
    );
  if (error) {
    console.error('[avancement] preuve Qualiopi non déposée', dossierId, stepKey, error.message);
  }
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

  // La preuve part avec la validation. La laisser survivre rendrait
  // l'indicateur satisfait par un geste annulé — et rien à l'écran ne dirait
  // pourquoi il reste vert.
  await retirerLesPreuves(p.data.dossierId, p.data.stepKey);

  revalidatePath(`/dossiers/${p.data.dossierId}`);
  revalidatePath(`/dossiers/${p.data.dossierId}/qualiopi`);
  return { ok: true };
}

/** Retire les preuves posées par cette étape, et elles seules. */
async function retirerLesPreuves(dossierId: string, stepKey: string): Promise<void> {
  const { error } = await supabaseAdmin()
    .schema('app')
    .from('qualiopi_proofs')
    .delete()
    .eq('dossier_id', dossierId)
    .contains('metadata', { source: 'avancement_manuel', step_key: stepKey } as never);
  if (error) console.error('[avancement] preuve Qualiopi non retirée', dossierId, stepKey, error.message);
}
