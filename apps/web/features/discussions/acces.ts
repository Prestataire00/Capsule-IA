import 'server-only';
import { getCurrentMember } from '@/shared/lib/auth/current-member';
import { can } from '@/shared/lib/auth/permissions';
import { supabaseAdmin } from '@/shared/lib/supabase/admin';
import { supabaseServer } from '@/shared/lib/supabase/server';
import { requireMyTrainerDossier } from '@/features/trainer-space/my-dossiers';
import { filDe } from './equipe';
import { exigerLecture } from '@/shared/lib/supabase/echec-lecture';

/**
 * Qui lit et écrit la discussion d'équipe d'un dossier : l'équipe de
 * l'organisme qui suit les dossiers, et le formateur pour ses dossiers. Les
 * deux chemins se vérifient séparément : jamais l'un pour l'autre.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type AccesDiscussion = { ok: true; userId: string; nom: string; organizationId: string } | { ok: false };

async function organisationDuDossier(dossierId: string): Promise<string | null> {
  const { data } = await supabaseAdmin()
    .schema('app')
    .from('dossiers')
    .select('organization_id')
    .eq('id', dossierId)
    .is('deleted_at', null)
    .maybeSingle();
  return (data as { organization_id: string } | null)?.organization_id ?? null;
}

/** Côté organisme : un membre de l'équipe (pas le rôle formateur) qui suit les dossiers. */
export async function accesEquipe(filId: string | null): Promise<AccesDiscussion> {
  const me = await getCurrentMember();
  if (!me || me.role === 'formateur' || can(me.role, 'dossiers') === 'none') return { ok: false };
  if (filId !== null) {
    if (!UUID.test(filId) || (await filDe(filId))?.organizationId !== me.organizationId) return { ok: false };
  }
  return { ok: true, userId: me.userId, nom: me.fullName, organizationId: me.organizationId };
}

/** Côté formateur : un dossier qui lui est confié. */
export async function accesFormateur(dossierId: string): Promise<AccesDiscussion> {
  if (!UUID.test(dossierId)) return { ok: false };
  const acces = await requireMyTrainerDossier(dossierId);
  if (!acces.ok) return { ok: false };
  const organizationId = await organisationDuDossier(dossierId);
  if (!organizationId) return { ok: false };
  const { data } = await supabaseAdmin()
    .schema('app')
    .from('trainers')
    .select('first_name, last_name')
    .eq('user_id', acces.userId)
    .eq('organization_id', organizationId)
    .maybeSingle();
  const t = data as { first_name: string | null; last_name: string | null } | null;
  return { ok: true, userId: acces.userId, nom: `${t?.first_name ?? ''} ${t?.last_name ?? ''}`.trim() || 'Formateur', organizationId };
}

/** Les dossiers confiés au formateur connecté. */
export async function mesDossiersFormateur(): Promise<string[]> {
  const { data, error } = await supabaseServer().schema('app').rpc('my_trainer_dossier_ids' as never);
  exigerLecture('dossiers du formateur', error);
  return ((data ?? []) as string[]).filter(Boolean);
}

export type MoiFormateur = { ok: true; userId: string; nom: string; organizationIds: string[] } | { ok: false };

/** Le formateur connecté, hors dossier : les organismes dont il a une fiche liée à son compte. */
export async function moiFormateur(): Promise<MoiFormateur> {
  const { data: auth } = await supabaseServer().auth.getUser();
  if (!auth.user) return { ok: false };
  const { data, error } = await supabaseAdmin()
    .schema('app')
    .from('trainers')
    .select('organization_id, first_name, last_name')
    .eq('user_id', auth.user.id)
    .is('deleted_at', null);
  if (error) throw new Error(`[discussion] fiche formateur illisible : ${error.message}`);
  const fiches = (data ?? []) as Array<{ organization_id: string; first_name: string | null; last_name: string | null }>;
  if (fiches.length === 0) return { ok: false };
  const f = fiches[0]!;
  return {
    ok: true,
    userId: auth.user.id,
    nom: `${f.first_name ?? ''} ${f.last_name ?? ''}`.trim() || 'Formateur',
    organizationIds: [...new Set(fiches.map((x) => x.organization_id))],
  };
}
