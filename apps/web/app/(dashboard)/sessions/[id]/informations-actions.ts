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
  /** Groupe visé (0194) ; chaîne vide = tout le dossier. */
  groupeId: z.string().trim().optional().default(''),
});

export type SessionInfoInput = z.input<typeof infoSchema>;

/**
 * Remet les participants d'accord avec le groupe choisi.
 *
 * Changer le groupe ne suffit pas : la dérivation ne retire que les lignes
 * qu'elle a posées (`derived`). Celles écrites à la main au rattachement d'un
 * stagiaire — `manual_add` — survivraient, et la séance continuerait d'attendre
 * tout le dossier alors qu'elle affiche « Groupe A ». Le filtre n'aurait servi
 * à rien, et cela ne se serait vu qu'en salle, feuille d'émargement en main.
 *
 * Les exclusions explicites (`manual_remove`) sont conservées : quelqu'un
 * qu'on a retiré à la main reste retiré, groupe ou pas.
 */
async function accorderParticipantsAuGroupe(sessionId: string, groupeId: string | null): Promise<void> {
  const sb = supabaseAdmin();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (sb as any).schema('app').rpc('materialize_session_participants', { p_session_id: sessionId });
  if (!groupeId) return;

  const { data: membresRows } = await sb
    .schema('app')
    .from('dossier_groupe_membres' as never)
    .select('learner_id')
    .eq('groupe_id', groupeId);
  const duGroupe = ((membresRows ?? []) as unknown as Array<{ learner_id: string }>).map((m) => m.learner_id);

  let suppression = sb
    .schema('app')
    .from('session_participants')
    .delete()
    .eq('session_id', sessionId)
    .eq('participant_kind', 'learner')
    .neq('source', 'manual_remove');
  // Un groupe vide retire tout le monde : c'est cohérent, la séance n'attend
  // alors personne — et l'écran affiche « 0 stagiaire », ce qui se voit.
  if (duGroupe.length > 0) suppression = suppression.not('learner_id', 'in', `(${duGroupe.join(',')})`);
  const { error } = await suppression;
  if (error) console.error('[séance] participants hors groupe non retirés', sessionId, error.message);
}

export async function updateSessionInfo(input: SessionInfoInput): Promise<Result> {
  const p = infoSchema.safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? 'Saisie invalide.' };
  const g = await garde(p.data.sessionId);
  if (!g.ok) return g;

  // Le groupe d'avant : la réconciliation des participants ne doit se
  // déclencher que s'il change. Sinon, enregistrer une simple note retirerait
  // un stagiaire ajouté exprès à la main — un geste sans rapport, aux
  // conséquences invisibles.
  const { data: avant } = await supabaseAdmin()
    .schema('app')
    .from('sessions')
    .select('groupe_id')
    .eq('id', p.data.sessionId)
    .maybeSingle();
  const groupeAvant = (avant as { groupe_id?: string | null } | null)?.groupe_id ?? null;
  const groupeApres = p.data.groupeId || null;

  const { error } = await supabaseAdmin()
    .schema('app')
    .from('sessions')
    .update({
      capacity_max: p.data.capacityMax ? Number(p.data.capacityMax) : null,
      price_cents: p.data.priceEuros ? eurosEnCentimes(p.data.priceEuros) : null,
      notes: p.data.notes || null,
      groupe_id: groupeApres,
    } as never)
    .eq('id', p.data.sessionId)
    .eq('organization_id', g.organizationId);
  if (error) {
    console.error('[séance] informations non enregistrées', error.message);
    return { ok: false, error: 'Les informations n’ont pas pu être enregistrées.' };
  }

  if (groupeAvant !== groupeApres) await accorderParticipantsAuGroupe(p.data.sessionId, groupeApres);

  revalidatePath(`/sessions/${p.data.sessionId}`, 'layout');
  revalidatePath(`/dossiers`, 'layout');
  return { ok: true };
}
