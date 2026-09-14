'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { supabaseAdmin } from '@/shared/lib/supabase/admin';
import { getCurrentMember } from '@/shared/lib/auth/current-member';
import { can } from '@/shared/lib/auth/permissions';

/**
 * Désignation du référent d'un dossier (`dossiers.contact_id`, 0167).
 *
 * Le référent n'était posé qu'à l'import d'une convention : un dossier créé
 * autrement n'avait aucun moyen d'en recevoir un. Deux gardes ici, le rôle et
 * l'organisation — vérifiée dans la requête, pas seulement chez l'appelant,
 * car une Server Action reçoit un identifiant du client et rien de plus.
 */

export type ReferentResult = { ok: true } | { ok: false; error: string };

type Garde =
  | { ok: true; organizationId: string; companyId: string | null }
  | { ok: false; error: string };

async function garder(dossierId: string): Promise<Garde> {
  const me = await getCurrentMember();
  if (!me) return { ok: false, error: 'Votre session a expiré, reconnectez-vous.' };
  if (can(me.role, 'dossiers') !== 'manage') {
    return { ok: false, error: "Vous n'avez pas le droit de modifier ce dossier." };
  }

  const { data } = await supabaseAdmin()
    .schema('app')
    .from('dossiers')
    .select('id, organization_id, company_id')
    .eq('id', dossierId)
    .maybeSingle();
  const d = data as { organization_id: string; company_id: string | null } | null;
  if (!d || d.organization_id !== me.organizationId) {
    return { ok: false, error: "Ce dossier n'appartient pas à votre organisation." };
  }
  return { ok: true, organizationId: d.organization_id, companyId: d.company_id };
}

const choixSchema = z.object({
  dossierId: z.string().uuid(),
  // Chaîne vide = retirer le référent : le dossier retombe sur le contact de l'entreprise.
  contactId: z.union([z.literal(''), z.string().uuid()]),
});

export async function designerReferent(input: { dossierId: string; contactId: string }): Promise<ReferentResult> {
  const p = choixSchema.safeParse(input);
  if (!p.success) return { ok: false, error: 'Choix invalide.' };

  const garde = await garder(p.data.dossierId);
  if (!garde.ok) return garde;

  const admin = supabaseAdmin();

  // Le contact doit être de la même organisation : sans ce contrôle, un
  // identifiant deviné rattacherait le référent d'un autre client.
  if (p.data.contactId) {
    const { data } = await admin
      .schema('app')
      .from('contacts')
      .select('id, organization_id')
      .eq('id', p.data.contactId)
      .is('deleted_at', null)
      .maybeSingle();
    const c = data as { organization_id: string } | null;
    if (!c || c.organization_id !== garde.organizationId) {
      return { ok: false, error: "Ce contact n'existe pas dans votre organisation." };
    }
  }

  const { error } = await admin
    .schema('app')
    .from('dossiers')
    .update({ contact_id: p.data.contactId || null } as never)
    .eq('id', p.data.dossierId);
  if (error) {
    // La colonne n'existe pas tant que la 0167 n'est pas jouée : le dire plutôt
    // que de laisser l'écran muet.
    const manquante = /contact_id/.test(error.message) && /column/i.test(error.message);
    return {
      ok: false,
      error: manquante
        ? "La base n'est pas à jour (migration 0167) : le référent ne peut pas encore être enregistré."
        : "Le référent n'a pas été enregistré.",
    };
  }

  revalidatePath(`/dossiers/${p.data.dossierId}`);
  return { ok: true };
}

const creationSchema = z.object({
  dossierId: z.string().uuid(),
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
  position: z.string().trim().max(150).optional(),
  email: z.union([z.literal(''), z.string().trim().email().max(200)]).optional(),
  phone: z.string().trim().max(40).optional(),
});

/**
 * Crée le contact chez l'entreprise cliente et le désigne dans la foulée :
 * saisir un référent ne doit pas obliger à passer par la fiche entreprise.
 */
export async function creerEtDesignerReferent(input: {
  dossierId: string;
  firstName: string;
  lastName: string;
  position?: string;
  email?: string;
  phone?: string;
}): Promise<ReferentResult> {
  const p = creationSchema.safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? 'Saisie invalide.' };

  const garde = await garder(p.data.dossierId);
  if (!garde.ok) return garde;
  if (!garde.companyId) {
    return {
      ok: false,
      error: "Ce dossier n'a pas d'entreprise cliente : un référent se rattache à une entreprise.",
    };
  }

  const { data, error } = await supabaseAdmin()
    .schema('app')
    .from('contacts')
    .insert({
      organization_id: garde.organizationId,
      company_id: garde.companyId,
      first_name: p.data.firstName,
      last_name: p.data.lastName,
      position: p.data.position?.trim() || null,
      email: p.data.email?.trim() || null,
      phone: p.data.phone?.trim() || null,
    } as never)
    .select('id')
    .single();
  if (error || !data) return { ok: false, error: "Le contact n'a pas été créé." };

  return designerReferent({ dossierId: p.data.dossierId, contactId: (data as { id: string }).id });
}
