'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { guardAction } from '@/shared/lib/auth/guard-action';
import { supabaseAdmin } from '@/shared/lib/supabase/admin';
import type { GroupeResult } from '@/app/(dashboard)/dossiers/[id]/apprenants/groupes-actions';

/**
 * Les groupes d'une entreprise cliente, créés avant toute séance (0212 ;
 * point Capsule IA du 05/10/2026 : « les groupes doivent être créés avant les
 * sessions »). On y place ses salariés, puis chaque séance se rattache à son
 * groupe depuis ses informations. Écriture en service role : garde explicite.
 */

type Admin = ReturnType<typeof supabaseAdmin>;

async function entrepriseDeLOrganisme(admin: Admin, companyId: string, organizationId: string): Promise<boolean> {
  const { data } = await admin.schema('app').from('companies').select('id').eq('id', companyId).eq('organization_id', organizationId).is('deleted_at', null).maybeSingle();
  return Boolean(data);
}

async function groupeDuClient(admin: Admin, groupeId: string, organizationId: string): Promise<{ companyId: string } | null> {
  const { data } = await admin
    .schema('app')
    .from('dossier_groupes' as never)
    .select('company_id')
    .eq('id', groupeId)
    .eq('organization_id', organizationId)
    .not('company_id', 'is', null)
    .maybeSingle();
  const g = data as { company_id: string } | null;
  return g ? { companyId: g.company_id } : null;
}

const CreerSchema = z.object({ companyId: z.string().uuid(), nom: z.string().trim().min(1, 'Donnez un nom au groupe.').max(60) });

export async function creerGroupeClient(brut: z.input<typeof CreerSchema>): Promise<GroupeResult> {
  const garde = await guardAction('dossiers');
  if (!garde.ok) return { ok: false, error: garde.error };
  const p = CreerSchema.safeParse(brut);
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? 'Saisie invalide.' };
  const admin = supabaseAdmin();
  if (!(await entrepriseDeLOrganisme(admin, p.data.companyId, garde.member.organizationId))) return { ok: false, error: 'Entreprise introuvable.' };

  const { count } = await admin.schema('app').from('dossier_groupes' as never).select('id', { count: 'exact', head: true }).eq('company_id', p.data.companyId);
  const { error } = await admin
    .schema('app')
    .from('dossier_groupes' as never)
    .insert({ company_id: p.data.companyId, organization_id: garde.member.organizationId, nom: p.data.nom, ordre: count ?? 0, created_by: garde.member.userId } as never);
  if (error) {
    if (error.code === '23505') return { ok: false, error: 'Cette entreprise a déjà un groupe de ce nom.' };
    console.error('[groupes client] création impossible', p.data.companyId, error.message);
    return { ok: false, error: 'Le groupe n’a pas pu être créé.' };
  }
  revalidatePath(`/entreprises/${p.data.companyId}`);
  return { ok: true };
}

const RenommerSchema = z.object({ groupeId: z.string().uuid(), nom: z.string().trim().min(1, 'Donnez un nom au groupe.').max(60) });

export async function renommerGroupeClient(brut: z.input<typeof RenommerSchema>): Promise<GroupeResult> {
  const garde = await guardAction('dossiers');
  if (!garde.ok) return { ok: false, error: garde.error };
  const p = RenommerSchema.safeParse(brut);
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? 'Saisie invalide.' };
  const admin = supabaseAdmin();
  const g = await groupeDuClient(admin, p.data.groupeId, garde.member.organizationId);
  if (!g) return { ok: false, error: 'Groupe introuvable.' };
  const { error } = await admin.schema('app').from('dossier_groupes' as never).update({ nom: p.data.nom } as never).eq('id', p.data.groupeId);
  if (error) return { ok: false, error: error.code === '23505' ? 'Cette entreprise a déjà un groupe de ce nom.' : 'Le groupe n’a pas pu être renommé.' };
  revalidatePath(`/entreprises/${g.companyId}`);
  return { ok: true };
}

export async function supprimerGroupeClient(groupeId: string): Promise<GroupeResult> {
  const garde = await guardAction('dossiers');
  if (!garde.ok) return { ok: false, error: garde.error };
  if (!z.string().uuid().safeParse(groupeId).success) return { ok: false, error: 'Groupe introuvable.' };
  const admin = supabaseAdmin();
  const g = await groupeDuClient(admin, groupeId, garde.member.organizationId);
  if (!g) return { ok: false, error: 'Groupe introuvable.' };
  // Les séances du groupe redeviennent celles de toute l'entreprise (ON DELETE SET NULL).
  const { error } = await admin.schema('app').from('dossier_groupes' as never).delete().eq('id', groupeId);
  if (error) return { ok: false, error: 'Le groupe n’a pas pu être supprimé.' };
  revalidatePath(`/entreprises/${g.companyId}`);
  return { ok: true };
}

const AffectationSchema = z.object({ groupeId: z.string().uuid(), learnerId: z.string().uuid(), dedans: z.boolean() });

/** Met un salarié dans un groupe de son entreprise, ou l'en retire ; ses séances suivent. */
export async function affecterAuGroupeClient(brut: z.input<typeof AffectationSchema>): Promise<GroupeResult> {
  const garde = await guardAction('dossiers');
  if (!garde.ok) return { ok: false, error: garde.error };
  const p = AffectationSchema.safeParse(brut);
  if (!p.success) return { ok: false, error: 'Saisie invalide.' };
  const admin = supabaseAdmin();
  const g = await groupeDuClient(admin, p.data.groupeId, garde.member.organizationId);
  if (!g) return { ok: false, error: 'Groupe introuvable.' };

  // Un groupe réunit des salariés de l'entreprise, pas d'autres personnes.
  const { data: salarie } = await admin
    .schema('app')
    .from('learners')
    .select('id')
    .eq('id', p.data.learnerId)
    .eq('company_id', g.companyId)
    .eq('organization_id', garde.member.organizationId)
    .is('deleted_at', null)
    .maybeSingle();
  if (!salarie) return { ok: false, error: 'Cette personne n’est pas rattachée à l’entreprise.' };

  const { data: seances } = await admin.schema('app').from('sessions').select('id').eq('groupe_id' as never, p.data.groupeId as never);
  const seanceIds = ((seances ?? []) as Array<{ id: string }>).map((s) => s.id);

  if (p.data.dedans) {
    const { error } = await admin
      .schema('app')
      .from('dossier_groupe_membres' as never)
      .upsert({ groupe_id: p.data.groupeId, learner_id: p.data.learnerId, organization_id: garde.member.organizationId } as never, { onConflict: 'groupe_id,learner_id' });
    if (error) return { ok: false, error: 'L’affectation n’a pas été enregistrée.' };
    // Les séances déjà rattachées au groupe l'attendent désormais (sans dossier, rien ne le dérive).
    if (seanceIds.length > 0) {
      const { error: e2 } = await admin
        .schema('app')
        .from('session_participants')
        .upsert(
          seanceIds.map((sid) => ({ session_id: sid, organization_id: garde.member.organizationId, participant_kind: 'learner', learner_id: p.data.learnerId, source: 'manual_add' })) as never,
          { onConflict: 'session_id,participant_kind,participant_id', ignoreDuplicates: true },
        );
      if (e2) console.error('[groupes client] inscription aux séances incomplète', p.data.groupeId, e2.message);
    }
  } else {
    const { error } = await admin.schema('app').from('dossier_groupe_membres' as never).delete().eq('groupe_id', p.data.groupeId).eq('learner_id', p.data.learnerId);
    if (error) return { ok: false, error: 'Le retrait n’a pas été enregistré.' };
    if (seanceIds.length > 0) {
      await admin
        .schema('app')
        .from('session_participants')
        .delete()
        .in('session_id', seanceIds)
        .eq('learner_id', p.data.learnerId)
        .eq('participant_kind', 'learner')
        .neq('source', 'manual_remove');
    }
  }
  revalidatePath(`/entreprises/${g.companyId}`);
  return { ok: true };
}
