import 'server-only';
import { supabaseServer } from '@/shared/lib/supabase/server';

/**
 * Garde des actions d'émargement.
 *
 * Elles écrivent en service role : l'accès se vérifie donc explicitement. La
 * feuille (ou la séance) doit être visible par l'utilisateur connecté sous
 * RLS — équipe de l'organisme, ou formateur de la séance.
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

export async function accessibleSheet(sheetId: string): Promise<AccessResult<SheetRef>> {
  const sb = supabaseServer();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return { ok: false, error: 'unauthenticated' };
  const { data } = await sb
    .schema('app')
    .from('attendance_sheets')
    .select('id, session_id, organization_id, dossier_id, status, half_day')
    .eq('id', sheetId)
    .maybeSingle();
  if (!data) return { ok: false, error: 'forbidden' };
  return { ok: true, userId: user.id, value: data as unknown as SheetRef };
}

export async function accessibleSession(sessionId: string): Promise<AccessResult<{ id: string; organization_id: string }>> {
  const sb = supabaseServer();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return { ok: false, error: 'unauthenticated' };
  const { data } = await sb.schema('app').from('sessions').select('id, organization_id').eq('id', sessionId).maybeSingle();
  if (!data) return { ok: false, error: 'forbidden' };
  return { ok: true, userId: user.id, value: data as { id: string; organization_id: string } };
}
