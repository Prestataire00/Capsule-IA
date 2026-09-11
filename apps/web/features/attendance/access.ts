import 'server-only';
import { supabaseServer } from '@/shared/lib/supabase/server';
import { getCurrentMember } from '@/shared/lib/auth/current-member';
import { can } from '@/shared/lib/auth/permissions';

/**
 * Garde des actions d'émargement.
 *
 * Elles écrivent en service role : l'accès se vérifie donc explicitement, en
 * deux temps. Le rôle doit gérer l'émargement (administrateur, gestionnaire,
 * formateur — pas un commercial ni un comptable, que la RLS laisse pourtant
 * voir les séances), et la feuille ou la séance doit être visible sous RLS :
 * équipe de l'organisme, ou formateur de la séance.
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

async function roleAutorise(): Promise<{ ok: true; userId: string } | { ok: false; error: 'unauthenticated' | 'forbidden' }> {
  const membre = await getCurrentMember();
  if (!membre) return { ok: false, error: 'unauthenticated' };
  if (can(membre.role, 'attendance') !== 'manage') return { ok: false, error: 'forbidden' };
  return { ok: true, userId: membre.userId };
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
  return { ok: true, userId: role.userId, value: data as unknown as SheetRef };
}

export async function accessibleSession(sessionId: string): Promise<AccessResult<{ id: string; organization_id: string }>> {
  const role = await roleAutorise();
  if (!role.ok) return role;
  const { data } = await supabaseServer().schema('app').from('sessions').select('id, organization_id').eq('id', sessionId).maybeSingle();
  if (!data) return { ok: false, error: 'forbidden' };
  return { ok: true, userId: role.userId, value: data as { id: string; organization_id: string } };
}
