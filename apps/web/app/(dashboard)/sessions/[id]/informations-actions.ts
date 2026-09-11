'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { getCurrentMember } from '@/shared/lib/auth/current-member';
import { can } from '@/shared/lib/auth/permissions';
import { supabaseServer } from '@/shared/lib/supabase/server';
import { supabaseAdmin } from '@/shared/lib/supabase/admin';
import { eurosEnCentimes } from '@/features/trainer-space/billing-rules';

/**
 * Modification d'une séance depuis sa fiche (statut, capacité, tarif, notes).
 * Réservé aux rôles qui gèrent les dossiers, pour une séance visible sous RLS
 * et de l'organisme du membre ; l'écriture se fait ensuite en service role.
 */

type Result = { ok: true } | { ok: false; error: string };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function garde(sessionId: string): Promise<{ ok: true; organizationId: string } | { ok: false; error: string }> {
  if (!UUID.test(sessionId)) return { ok: false, error: 'Séance introuvable.' };
  const membre = await getCurrentMember();
  if (!membre) return { ok: false, error: 'Session expirée — reconnectez-vous.' };
  if (can(membre.role, 'dossiers') !== 'manage') return { ok: false, error: 'Votre rôle ne permet pas de modifier une séance.' };
  const { data } = await supabaseServer().schema('app').from('sessions').select('id, organization_id').eq('id', sessionId).maybeSingle();
  const s = data as { id: string; organization_id: string } | null;
  if (!s || s.organization_id !== membre.organizationId) return { ok: false, error: 'Séance introuvable.' };
  return { ok: true, organizationId: s.organization_id };
}

const statutSchema = z.enum(['planned', 'in_progress', 'done', 'cancelled']);

export async function updateSessionStatus(input: { sessionId: string; status: string }): Promise<Result> {
  const statut = statutSchema.safeParse(input?.status);
  if (!statut.success) return { ok: false, error: 'Statut inconnu.' };
  const g = await garde(input.sessionId);
  if (!g.ok) return g;
  const { error } = await supabaseAdmin()
    .schema('app')
    .from('sessions')
    .update({ status: statut.data } as never)
    .eq('id', input.sessionId)
    .eq('organization_id', g.organizationId);
  if (error) {
    console.error('[séance] statut non enregistré', error.message);
    return { ok: false, error: 'Le statut n’a pas pu être enregistré.' };
  }
  revalidatePath(`/sessions/${input.sessionId}`, 'layout');
  return { ok: true };
}

const infoSchema = z.object({
  sessionId: z.string().uuid(),
  capacityMax: z
    .string()
    .trim()
    .refine((v) => v === '' || (/^\d+$/.test(v) && Number(v) >= 1 && Number(v) <= 1000), 'Capacité : un nombre entre 1 et 1000'),
  priceEuros: z
    .string()
    .trim()
    .refine((v) => v === '' || eurosEnCentimes(v) !== null, 'Tarif invalide (ex. 1800 ou 1 800,00)'),
  notes: z.string().trim().max(2000, 'Notes : 2 000 caractères au plus'),
});

export type SessionInfoInput = z.input<typeof infoSchema>;

export async function updateSessionInfo(input: SessionInfoInput): Promise<Result> {
  const p = infoSchema.safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? 'Saisie invalide.' };
  const g = await garde(p.data.sessionId);
  if (!g.ok) return g;
  const { error } = await supabaseAdmin()
    .schema('app')
    .from('sessions')
    .update({
      capacity_max: p.data.capacityMax ? Number(p.data.capacityMax) : null,
      price_cents: p.data.priceEuros ? eurosEnCentimes(p.data.priceEuros) : null,
      notes: p.data.notes || null,
    } as never)
    .eq('id', p.data.sessionId)
    .eq('organization_id', g.organizationId);
  if (error) {
    console.error('[séance] informations non enregistrées', error.message);
    return { ok: false, error: 'Les informations n’ont pas pu être enregistrées.' };
  }
  revalidatePath(`/sessions/${p.data.sessionId}`, 'layout');
  return { ok: true };
}
