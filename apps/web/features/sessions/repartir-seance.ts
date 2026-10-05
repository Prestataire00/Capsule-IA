'use server';

import { revalidatePath } from 'next/cache';
import { getCurrentMember } from '@/shared/lib/auth/current-member';
import { can } from '@/shared/lib/auth/permissions';
import { supabaseAdmin } from '@/shared/lib/supabase/admin';
import { loadSession } from './load-session';
import { problemeDeRepartition } from './repartition';
import { repartitionSchema, type RepartitionInput } from './repartition.schema';
import { creerVisioDeSeance, estADistance } from './visio';

/**
 * Répartir une séance en groupes, le jour J : on ne connaît souvent les
 * groupes qu'en salle. La séance garde le premier groupe ; chaque autre groupe
 * reçoit une séance jumelle, au même créneau, avec ses participants, son
 * formateur, ses questionnaires et ses automatisations, sa visio. Les
 * signatures déjà posées suivent le stagiaire dans la séance de son groupe.
 * Sur demande, les séances suivantes du dossier sont réparties de même.
 */

type Admin = ReturnType<typeof supabaseAdmin>;

type Seance = {
  id: string;
  organization_id: string;
  dossier_id: string | null;
  formation_id: string | null;
  title: string | null;
  modality: string;
  status: string;
  starts_at: string;
  ends_at: string;
  location: string | null;
  price_cents: number | null;
  capacity_max: number | null;
  notes: string | null;
  groupe_id: string | null;
};

const COLONNES = 'id, organization_id, dossier_id, formation_id, title, modality, status, starts_at, ends_at, location, price_cents, capacity_max, notes, groupe_id';

export type RepartitionResult = { ok: true; seancesCreees: number; seancesReparties: number } | { ok: false; error: string };

export async function repartirSeance(input: RepartitionInput): Promise<RepartitionResult> {
  const p = repartitionSchema.safeParse(input);
  if (!p.success) return { ok: false, error: 'Répartition invalide.' };
  const me = await getCurrentMember();
  if (!me) return { ok: false, error: 'Votre session a expiré, reconnectez-vous.' };
  if (can(me.role, 'dossiers') !== 'manage') return { ok: false, error: 'Votre rôle ne permet pas de modifier une séance.' };

  const admin = supabaseAdmin();
  const { data: s } = await admin.schema('app').from('sessions').select(COLONNES).eq('id', p.data.sessionId).maybeSingle();
  const source = s as unknown as Seance | null;
  if (!source || source.organization_id !== me.organizationId) return { ok: false, error: 'Séance introuvable.' };
  if (!source.dossier_id) return { ok: false, error: 'Seules les séances d’un dossier se répartissent en groupes.' };
  if (source.groupe_id) return { ok: false, error: 'Cette séance est déjà celle d’un groupe.' };
  const dossierId = source.dossier_id;

  const loaded = await loadSession(admin, source.id);
  const stagiaires = (loaded?.learners ?? []).filter((l) => l.dossierId === dossierId).map((l) => l.id);
  const probleme = problemeDeRepartition(p.data.groupes, stagiaires);
  if (probleme) return { ok: false, error: probleme };

  // Les séances à répartir : celle-ci, et les suivantes du dossier si demandé.
  let cibles: Seance[] = [source];
  if (p.data.appliquerSuite) {
    const { data: suite } = await admin
      .schema('app')
      .from('sessions')
      .select(COLONNES)
      .eq('dossier_id', dossierId)
      .is('groupe_id' as never, null)
      .eq('status', 'planned')
      .gt('starts_at', source.starts_at)
      .order('starts_at', { ascending: true });
    cibles = [source, ...((suite ?? []) as unknown as Seance[])];
  }

  // Une feuille clôturée ne se modifie plus : on refuse avant d'écrire quoi que ce soit.
  const { data: feuilles } = await admin
    .schema('app')
    .from('attendance_sheets')
    .select('session_id, status')
    .in('session_id', cibles.map((c) => c.id));
  if (((feuilles ?? []) as Array<{ status: string }>).some((f) => f.status === 'finalized' || f.status === 'completed')) {
    return { ok: false, error: 'Une feuille d’émargement est déjà clôturée : la séance ne peut plus être répartie.' };
  }

  const groupeIds = await assurerGroupes(admin, dossierId, me.organizationId, me.userId, p.data.groupes);
  if (!groupeIds.ok) return groupeIds;

  let creees = 0;
  for (const cible of cibles) {
    const r = await repartirUneSeance(admin, cible, p.data.groupes, groupeIds.ids, me.userId);
    if (!r.ok) return { ok: false, error: `${r.error}${creees ? ` (${creees} séance(s) déjà créée(s))` : ''}` };
    creees += r.creees;
  }

  revalidatePath(`/sessions/${source.id}`, 'layout');
  revalidatePath(`/dossiers/${dossierId}`, 'layout');
  revalidatePath('/sessions');
  revalidatePath('/planning');
  return { ok: true, seancesCreees: creees, seancesReparties: cibles.length };
}

/** Les groupes du dossier, réutilisés s'ils existent déjà, et leurs membres. */
async function assurerGroupes(
  admin: Admin,
  dossierId: string,
  organizationId: string,
  userId: string,
  groupes: RepartitionInput['groupes'],
): Promise<{ ok: true; ids: string[] } | { ok: false; error: string }> {
  const ids: string[] = [];
  for (const [i, g] of groupes.entries()) {
    const { data: existant } = await admin
      .schema('app')
      .from('dossier_groupes' as never)
      .select('id')
      .eq('dossier_id', dossierId)
      .eq('nom', g.nom.trim())
      .maybeSingle();
    let id = (existant as { id: string } | null)?.id ?? null;
    if (!id) {
      const { data: cree, error } = await admin
        .schema('app')
        .from('dossier_groupes' as never)
        .insert({ dossier_id: dossierId, organization_id: organizationId, nom: g.nom.trim(), ordre: i, created_by: userId } as never)
        .select('id')
        .single();
      if (error || !cree) return { ok: false, error: `Le groupe « ${g.nom} » n’a pas pu être créé.` };
      id = (cree as { id: string }).id;
    }
    ids.push(id);
  }

  // Chacun dans son groupe et seulement le sien, parmi les groupes répartis.
  const { error: purge } = await admin.schema('app').from('dossier_groupe_membres' as never).delete().in('groupe_id', ids);
  if (purge) return { ok: false, error: 'Les groupes n’ont pas pu être mis à jour.' };
  const membres = groupes.flatMap((g, i) => g.learnerIds.map((learnerId) => ({ groupe_id: ids[i]!, learner_id: learnerId, organization_id: organizationId })));
  const { error } = await admin.schema('app').from('dossier_groupe_membres' as never).insert(membres as never);
  if (error) return { ok: false, error: 'Les stagiaires n’ont pas pu être placés dans leurs groupes.' };
  return { ok: true, ids };
}

async function repartirUneSeance(
  admin: Admin,
  cible: Seance,
  groupes: RepartitionInput['groupes'],
  groupeIds: string[],
  userId: string,
): Promise<{ ok: true; creees: number } | { ok: false; error: string }> {
  const [{ data: formateurs }, { data: questionnaires }, { data: automatisations }] = await Promise.all([
    admin
      .schema('app')
      .from('session_trainers' as never)
      .select('trainer_id, is_lead, hourly_rate_cents, amount_cents')
      .eq('session_id', cible.id)
      .is('deleted_at', null),
    admin.schema('app').from('session_questionnaires' as never).select('template_id, ancre, decalage_jours, enabled').eq('session_id', cible.id),
    admin.schema('app').from('session_automation_settings' as never).select('key, enabled').eq('session_id' as never, cible.id as never),
  ]);
  const equipe = (formateurs ?? []) as unknown as Array<{ trainer_id: string; is_lead: boolean; hourly_rate_cents: number | null; amount_cents: number | null }>;

  // Premier groupe : la séance elle-même.
  const { error: maj } = await admin.schema('app').from('sessions').update({ groupe_id: groupeIds[0] } as never).eq('id', cible.id);
  if (maj) return { ok: false, error: 'La séance n’a pas pu être rattachée à son groupe.' };
  await accorderAuGroupe(admin, cible, groupes[0]!.learnerIds);
  await poserFormateur(admin, cible, groupes[0]!.trainerId ?? null, equipe);

  let creees = 0;
  for (let i = 1; i < groupes.length; i++) {
    const g = groupes[i]!;
    const { data: jumelle, error } = await admin
      .schema('app')
      .from('sessions')
      .insert({
        organization_id: cible.organization_id,
        dossier_id: cible.dossier_id,
        formation_id: cible.formation_id,
        title: cible.title,
        modality: cible.modality,
        status: cible.status,
        starts_at: cible.starts_at,
        ends_at: cible.ends_at,
        location: cible.location,
        price_cents: cible.price_cents,
        capacity_max: cible.capacity_max,
        notes: cible.notes,
        groupe_id: groupeIds[i],
      } as never)
      .select(COLONNES)
      .single();
    if (error || !jumelle) return { ok: false, error: `La séance du ${g.nom} n’a pas pu être créée.` };
    const seance = jumelle as unknown as Seance;
    creees += 1;

    await admin
      .schema('app')
      .from('session_dossiers')
      .upsert({ session_id: seance.id, dossier_id: cible.dossier_id, organization_id: cible.organization_id } as never, {
        onConflict: 'session_id,dossier_id',
      });
    await accorderAuGroupe(admin, seance, g.learnerIds);
    await poserFormateur(admin, seance, g.trainerId ?? null, equipe);
    await copier(admin, 'session_questionnaires', seance, (questionnaires ?? []) as unknown as Array<Record<string, unknown>>);
    await copier(admin, 'session_automation_settings', seance, (automatisations ?? []) as unknown as Array<Record<string, unknown>>);
    await deplacerSignatures(admin, cible.id, seance.id, g.learnerIds);
    if (estADistance(seance.modality)) {
      const visio = await creerVisioDeSeance(admin as never, seance.id, userId);
      if (visio === 'failed') console.error('[répartition] visio non créée', seance.id);
    }
  }
  return { ok: true, creees };
}

/** Les participants de la séance : exactement les membres du groupe. */
async function accorderAuGroupe(admin: Admin, seance: Seance, membres: readonly string[]): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (admin as any).schema('app').rpc('materialize_session_participants', { p_session_id: seance.id });
  const { error: purge } = await admin
    .schema('app')
    .from('session_participants')
    .delete()
    .eq('session_id', seance.id)
    .eq('participant_kind', 'learner')
    .neq('source', 'manual_remove')
    .not('learner_id', 'in', `(${membres.join(',')})`);
  if (purge) console.error('[répartition] participants hors groupe non retirés', seance.id, purge.message);
  // Un stagiaire ajouté le jour J (hors dossier) n'est pas dérivé : on l'inscrit.
  const { error } = await admin
    .schema('app')
    .from('session_participants')
    .upsert(
      membres.map((learnerId) => ({
        session_id: seance.id,
        organization_id: seance.organization_id,
        participant_kind: 'learner',
        learner_id: learnerId,
        source: 'manual_add',
      })) as never,
      { onConflict: 'session_id,participant_kind,participant_id' },
    );
  if (error) console.error('[répartition] inscription des membres incomplète', seance.id, error.message);
}

/** Le formateur choisi pour le groupe, sinon celui de la séance d'origine. */
async function poserFormateur(
  admin: Admin,
  seance: Seance,
  trainerId: string | null,
  equipe: ReadonlyArray<{ trainer_id: string; is_lead: boolean; hourly_rate_cents: number | null; amount_cents: number | null }>,
): Promise<void> {
  const lignes = trainerId
    ? [{ trainer_id: trainerId, is_lead: true, hourly_rate_cents: null, amount_cents: null }]
    : equipe;
  if (trainerId) {
    await admin
      .schema('app')
      .from('session_trainers' as never)
      .update({ deleted_at: new Date().toISOString() } as never)
      .eq('session_id', seance.id)
      .neq('trainer_id', trainerId);
  }
  if (lignes.length === 0) return;
  const { error } = await admin
    .schema('app')
    .from('session_trainers' as never)
    .upsert(
      lignes.map((l) => ({ ...l, session_id: seance.id, organization_id: seance.organization_id, deleted_at: null })) as never,
      { onConflict: 'session_id,trainer_id' },
    );
  if (error) console.error('[répartition] formateur non posé', seance.id, error.message);
}

async function copier(
  admin: Admin,
  table: 'session_questionnaires' | 'session_automation_settings',
  seance: Seance,
  lignes: ReadonlyArray<Record<string, unknown>>,
): Promise<void> {
  if (lignes.length === 0) return;
  const { error } = await admin
    .schema('app')
    .from(table as never)
    .insert(lignes.map((l) => ({ ...l, session_id: seance.id, organization_id: seance.organization_id })) as never);
  if (error) console.error(`[répartition] ${table} non recopié`, seance.id, error.message);
}

/**
 * Les signatures déjà posées par les membres du groupe passent sur la feuille
 * de même demi-journée de leur nouvelle séance : rien n'est à refaire.
 */
async function deplacerSignatures(admin: Admin, depuis: string, vers: string, membres: readonly string[]): Promise<void> {
  const { data: origine } = await admin.schema('app').from('attendance_sheets').select('id, half_day').eq('session_id', depuis);
  const feuillesOrigine = (origine ?? []) as Array<{ id: string; half_day: string }>;
  if (feuillesOrigine.length === 0) return;

  const { data: signees } = await admin
    .schema('app')
    .from('attendance_signatures')
    .select('id, attendance_sheet_id')
    .in('attendance_sheet_id', feuillesOrigine.map((f) => f.id))
    .eq('participant_kind', 'learner')
    .in('learner_id', [...membres]);
  const aDeplacer = (signees ?? []) as Array<{ id: string; attendance_sheet_id: string }>;
  if (aDeplacer.length === 0) return;

  await admin.schema('app').rpc('materialize_attendance_slots' as never, { p_session_id: vers } as never);
  const { data: cible } = await admin.schema('app').from('attendance_sheets').select('id, half_day').eq('session_id', vers);
  const parDemiJournee = new Map(((cible ?? []) as Array<{ id: string; half_day: string }>).map((f) => [f.half_day, f.id]));
  const demiJourneeDe = new Map(feuillesOrigine.map((f) => [f.id, f.half_day]));

  for (const sig of aDeplacer) {
    const nouvelle = parDemiJournee.get(demiJourneeDe.get(sig.attendance_sheet_id) ?? '');
    if (!nouvelle) continue;
    const { error } = await admin
      .schema('app')
      .from('attendance_signatures')
      .update({ attendance_sheet_id: nouvelle } as never)
      .eq('id', sig.id);
    if (error) console.error('[répartition] signature non déplacée', sig.id, error.message);
  }
}
