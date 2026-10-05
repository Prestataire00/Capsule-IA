import 'server-only';
import { getCurrentMember } from '@/shared/lib/auth/current-member';
import { can } from '@/shared/lib/auth/permissions';
import { supabaseAdmin } from '@/shared/lib/supabase/admin';
import { supabaseServer } from '@/shared/lib/supabase/server';
import { requireMyTrainerDossier } from '@/features/trainer-space/my-dossiers';
import { requireMyTrainerSession } from '@/features/trainer-space/guard';
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

/** Côté organisme : un membre de l'équipe (pas le rôle formateur) qui suit les dossiers. Le fil est un dossier ou une séance (0210). */
export async function accesEquipe(filId: string | null): Promise<AccesDiscussion> {
  const me = await getCurrentMember();
  if (!me || me.role === 'formateur' || can(me.role, 'dossiers') === 'none') return { ok: false };
  if (filId !== null) {
    if (!UUID.test(filId) || (await filDe(filId))?.organizationId !== me.organizationId) return { ok: false };
  }
  return { ok: true, userId: me.userId, nom: me.fullName, organizationId: me.organizationId };
}

/** Côté formateur : un dossier, ou une séance sans dossier, qui lui est confié. */
export async function accesFormateur(filId: string): Promise<AccesDiscussion> {
  if (!UUID.test(filId)) return { ok: false };
  const fil = await filDe(filId);
  if (!fil) return { ok: false };
  const acces = fil.kind === 'dossier' ? await requireMyTrainerDossier(filId) : await requireMyTrainerSession(filId);
  if (!acces.ok) return { ok: false };
  const organizationId = fil.kind === 'dossier' ? await organisationDuDossier(filId) : fil.organizationId;
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

/** Les fils du formateur connecté : ses dossiers, et ses séances sans dossier. */
export async function mesDossiersFormateur(): Promise<string[]> {
  const sb = supabaseServer();
  const [{ data, error }, { data: seances, error: e2 }] = await Promise.all([
    sb.schema('app').rpc('my_trainer_dossier_ids' as never),
    sb.schema('app').rpc('my_trainer_session_ids' as never),
  ]);
  exigerLecture('dossiers du formateur', error);
  exigerLecture('séances du formateur', e2);
  const ids = ((seances ?? []) as string[]).filter(Boolean);
  const { data: sansDossier } = ids.length
    ? await supabaseAdmin().schema('app').from('sessions').select('id').in('id', ids).is('dossier_id', null)
    : { data: [] };
  return [...((data ?? []) as string[]).filter(Boolean), ...((sansDossier ?? []) as Array<{ id: string }>).map((s) => s.id)];
}
