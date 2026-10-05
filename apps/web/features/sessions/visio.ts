import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { GoogleCalendarCredentials } from '@/shared/lib/integrations/google-secrets-cipher';
import {
  loadGoogleCredsForOrganization,
  loadGoogleCredsForUser,
} from '@/shared/lib/integrations/google-calendar-store';
import { formateursRetenus } from './invites-visio';

/**
 * Qui organise le Meet d'une séance, et quels formateurs y inviter.
 *
 * L'agenda de l'organisme (la boîte formateur, 0203) organise toutes les
 * visios dès qu'il est connecté : les invitations partent de cette adresse et
 * les outils d'enregistrement branchés dessus (tl;dv, Lexi) rejoignent chaque
 * séance. À défaut, l'agenda de la personne qui planifie, comme avant.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Sb = SupabaseClient<any, any, any>;

/** Ce qu'on note sur la séance pour retrouver l'évènement plus tard. */
export type ProprietaireMeet = { organizer: 'organisme' } | { organizer: 'membre'; owner_user_id: string };

export type ZoomMetadataMeet = {
  provider?: string;
  calendar_event_id?: string;
  organizer?: 'organisme' | 'membre';
  owner_user_id?: string;
} | null;

export async function organisateurDuMeet(
  sb: Sb,
  organizationId: string,
  userId: string | null,
): Promise<{ creds: GoogleCalendarCredentials; proprietaire: ProprietaireMeet } | null> {
  const organisme = await loadGoogleCredsForOrganization(sb, organizationId);
  if (organisme) return { creds: organisme, proprietaire: { organizer: 'organisme' } };
  if (!userId) return null;
  const perso = await loadGoogleCredsForUser(sb, userId);
  return perso ? { creds: perso, proprietaire: { organizer: 'membre', owner_user_id: userId } } : null;
}

export function metadataMeet(eventId: string, proprietaire: ProprietaireMeet): Record<string, unknown> {
  return { provider: 'google_meet', calendar_event_id: eventId, ...proprietaire };
}

/** L'agenda où vit déjà l'évènement d'une séance — pour le déplacer. */
export async function agendaDeLEvenement(
  sb: Sb,
  organizationId: string,
  metadata: ZoomMetadataMeet,
  userIdParDefaut: string,
): Promise<GoogleCalendarCredentials | null> {
  if (metadata?.organizer === 'organisme') return loadGoogleCredsForOrganization(sb, organizationId);
  return loadGoogleCredsForUser(sb, metadata?.owner_user_id ?? userIdParDefaut);
}

/** Adresses des formateurs qui animent la séance. */
export async function emailsFormateursDeSeance(sb: Sb, sessionId: string): Promise<string[]> {
  const { data: s } = await sb
    .schema('app')
    .from('sessions')
    .select('dossier_id, formation_id')
    .eq('id', sessionId)
    .maybeSingle();
  const seance = s as { dossier_id: string | null; formation_id: string | null } | null;
  if (!seance) return [];

  const [{ data: st }, { data: sd }] = await Promise.all([
    sb.schema('app').from('session_trainers').select('trainer_id').eq('session_id', sessionId).is('deleted_at', null),
    sb.schema('app').from('session_dossiers').select('dossier_id').eq('session_id', sessionId),
  ]);
  const dossierIds = [
    ...new Set([seance.dossier_id, ...((sd ?? []) as Array<{ dossier_id: string }>).map((d) => d.dossier_id)]),
  ].filter((id): id is string => Boolean(id));

  const { data: dt } = dossierIds.length
    ? await sb.schema('app').from('dossier_trainers').select('trainer_id').in('dossier_id', dossierIds)
    : { data: [] };

  let formationId = seance.formation_id;
  if (!formationId && dossierIds.length > 0) {
    const { data: d } = await sb.schema('app').from('dossiers').select('formation_id').in('id', dossierIds).limit(1);
    formationId = ((d ?? []) as Array<{ formation_id: string | null }>)[0]?.formation_id ?? null;
  }
  const { data: f } = formationId
    ? await sb.schema('app').from('formations').select('metadata').eq('id', formationId).maybeSingle()
    : { data: null };
  const parDefaut =
    ((f as { metadata: { catalog?: { defaultTrainerId?: string } } | null } | null)?.metadata?.catalog
      ?.defaultTrainerId as string | undefined) ?? null;

  const ids = formateursRetenus({
    seance: ((st ?? []) as Array<{ trainer_id: string }>).map((t) => t.trainer_id),
    dossiers: ((dt ?? []) as Array<{ trainer_id: string }>).map((t) => t.trainer_id),
    formation: parDefaut,
  });
  if (ids.length === 0) return [];

  const { data: t } = await sb.schema('app').from('trainers').select('email').in('id', ids).is('deleted_at', null);
  return ((t ?? []) as Array<{ email: string | null }>).map((x) => x.email).filter((e): e is string => Boolean(e));
}
