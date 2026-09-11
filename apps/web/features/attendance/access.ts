import 'server-only';
import { supabaseServer } from '@/shared/lib/supabase/server';
import { getCurrentMember } from '@/shared/lib/auth/current-member';
import { can } from '@/shared/lib/auth/permissions';
import { hasTrainerSpace } from '@/shared/lib/auth/landing';

/**
 * Garde des actions d'émargement.
 *
 * Elles écrivent en service role : l'accès se vérifie donc explicitement, en
 * deux temps.
 *  · Membre de l'organisme : son rôle doit gérer l'émargement (administrateur,
 *    gestionnaire, formateur — pas un commercial ni un comptable, que la RLS
 *    laisse pourtant voir les séances), et la feuille ou la séance doit être
 *    visible sous RLS.
 *  · Formateur (externe, ou membre sans droit d'émargement) : fiche reliée et
 *    espace ouvert, et la séance doit être l'une des SIENNES — vérifié ici sur
 *    la liste de ses séances, pas seulement par la RLS (0150).
 */

export type SheetRef = {
  readonly id: string;
  readonly session_id: string;
  readonly organization_id: string;
  readonly dossier_id: string | null;
  readonly status: string;
  readonly half_day: string;
};

export type AccessResult<T> = { ok: true; userId: string; value: T } | { ok: false; error: 'unauthenticated' | 'forbidden' };

type Garde = { ok: true; userId: string; formateur: boolean } | { ok: false; error: 'unauthenticated' | 'forbidden' };

async function commeFormateur(): Promise<Garde | null> {
  const {
    data: { user },
  } = await supabaseServer().auth.getUser();
  if (!user || !(await hasTrainerSpace(user.id))) return null;
  return { ok: true, userId: user.id, formateur: true };
}

async function roleAutorise(): Promise<Garde> {
  const membre = await getCurrentMember();
  if (membre) {
    if (can(membre.role, 'attendance') !== 'manage') return (await commeFormateur()) ?? { ok: false, error: 'forbidden' };
    return { ok: true, userId: membre.userId, formateur: false };
  }
  return (await commeFormateur()) ?? { ok: false, error: 'unauthenticated' };
}

async function seanceDuFormateur(sessionId: string): Promise<boolean> {
  const { data, error } = await supabaseServer().schema('app').rpc('my_trainer_session_ids' as never);
  if (error) {
    console.error('[émargement] séances du formateur illisibles', error.message);
    return false;
  }
  return ((data ?? []) as string[]).includes(sessionId);
}

export async function accessibleSheet(sheetId: string): Promise<AccessResult<SheetRef>> {
  const role = await roleAutorise();
  if (!role.ok) return role;
  const { data } = await supabaseServer()
    .schema('app')
    .from('attendance_sheets')
    .select('id, session_id, organization_id, dossier_id, status, half_day')
    .eq('id', sheetId)
    .maybeSingle();
  if (!data) return { ok: false, error: 'forbidden' };
  const feuille = data as unknown as SheetRef;
  if (role.formateur && !(await seanceDuFormateur(feuille.session_id))) return { ok: false, error: 'forbidden' };
  return { ok: true, userId: role.userId, value: feuille };
}

export async function accessibleSession(sessionId: string): Promise<AccessResult<{ id: string; organization_id: string }>> {
  const role = await roleAutorise();
  if (!role.ok) return role;
  const { data } = await supabaseServer().schema('app').from('sessions').select('id, organization_id').eq('id', sessionId).maybeSingle();
  if (!data) return { ok: false, error: 'forbidden' };
  if (role.formateur && !(await seanceDuFormateur(sessionId))) return { ok: false, error: 'forbidden' };
  return { ok: true, userId: role.userId, value: data as { id: string; organization_id: string } };
}
