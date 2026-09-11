'use server';

import { revalidatePath } from 'next/cache';
import { supabaseAdmin } from '@/shared/lib/supabase/admin';
import { guardAction } from '@/shared/lib/auth/guard-action';

const HEURE = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Active ou coupe l'envoi automatique des liens d'émargement de l'organisme. */
export async function setAttendanceAutoSend(enabled: boolean): Promise<{ ok: true } | { ok: false; error: string }> {
  if (typeof enabled !== 'boolean') return { ok: false, error: 'saisie_invalide' };
  const g = await guardAction('settings');
  if (!g.ok) return { ok: false, error: g.error };

  const { error } = await supabaseAdmin()
    .schema('app')
    .from('organizations')
    .update({ attendance_auto_send: enabled } as never)
    .eq('id', g.member.organizationId);
  if (error) {
    console.error('[paramètres] envoi automatique non enregistré', error);
    return { ok: false, error: 'enregistrement_impossible' };
  }
  revalidatePath('/parametres/organisation');
  return { ok: true };
}

/**
 * Pause déjeuner de l'organisme : elle sépare les feuilles du matin et de
 * l'après-midi, et n'est comptée ni comme retard ni comme heures dispensées.
 */
export async function setAttendanceLunch(debut: string, fin: string): Promise<{ ok: true } | { ok: false; error: string }> {
  if (typeof debut !== 'string' || typeof fin !== 'string' || !HEURE.test(debut) || !HEURE.test(fin)) {
    return { ok: false, error: 'heure_invalide' };
  }
  if (fin <= debut) return { ok: false, error: 'pause_incoherente' };
  const g = await guardAction('settings');
  if (!g.ok) return { ok: false, error: g.error };

  const { error } = await supabaseAdmin()
    .schema('app')
    .from('organizations')
    .update({ attendance_lunch_start: debut, attendance_lunch_end: fin } as never)
    .eq('id', g.member.organizationId);
  if (error) {
    console.error('[paramètres] pause déjeuner non enregistrée', error);
    return { ok: false, error: 'enregistrement_impossible' };
  }
  revalidatePath('/parametres/organisation');
  return { ok: true };
}
