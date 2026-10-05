import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { GoogleCalendarCredentials } from '@/shared/lib/integrations/google-secrets-cipher';
import {
  loadGoogleCredsForOrganization,
  loadGoogleCredsForUser,
} from '@/shared/lib/integrations/google-calendar-store';
import { createMeetEvent } from '@/shared/lib/integrations/google-calendar-client';
import { sendEmail, type SendEmailInput, type SendEmailResult } from '@/shared/lib/email/resend';
import { expediteurDeLOrganisme, nomAffichable, type Expediteur } from '@/shared/lib/email/expediteur-organisme';
import { lienVisioEntrepriseEmail, type SeanceEmailData } from '@/shared/lib/email/templates';
import { heure, jourLong } from '@/features/trainer-space/dates';
import { envoiActif } from '@/features/emails/programmation-store';
import { formateursRetenus, invitesVisio, referentDuDossier } from './invites-visio';

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

// ── Le lien visio, et ce qu'on en envoie ────────────────────────────────────

const REMOTE = new Set(['distanciel', 'hybride']);

export const estADistance = (modalite: string | null | undefined): boolean => REMOTE.has(modalite ?? '');

/** Adresses des entreprises clientes de la séance : le référent de chaque dossier, sinon l'entreprise. */
export async function emailsReferentsDeSeance(sb: Sb, sessionId: string): Promise<string[]> {
  const { data: s } = await sb
    .schema('app')
    .from('sessions')
    .select('dossier_id, company_id')
    .eq('id', sessionId)
    .maybeSingle();
  const seance = s as { dossier_id: string | null; company_id: string | null } | null;
  if (!seance) return [];

  const { data: sd } = await sb.schema('app').from('session_dossiers').select('dossier_id').eq('session_id', sessionId);
  const dossierIds = [
    ...new Set([seance.dossier_id, ...((sd ?? []) as Array<{ dossier_id: string }>).map((d) => d.dossier_id)]),
  ].filter((id): id is string => Boolean(id));

  const { data: dossiers } = dossierIds.length
    ? await sb
        .schema('app')
        .from('dossiers')
        .select('contact:contacts(email), company:companies(contact_email)')
        .in('id', dossierIds)
        .is('deleted_at', null)
    : { data: [] };
  const un = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null));
  const parDossier = ((dossiers ?? []) as Array<{
    contact: { email: string | null } | Array<{ email: string | null }> | null;
    company: { contact_email: string | null } | Array<{ contact_email: string | null }> | null;
  }>).map((d) =>
    referentDuDossier({ referentEmail: un(d.contact)?.email, companyEmail: un(d.company)?.contact_email }),
  );

  // Séance planifiée pour un client sans dossier (0161).
  const { data: client } = seance.company_id
    ? await sb.schema('app').from('companies').select('contact_email').eq('id', seance.company_id).maybeSingle()
    : { data: null };

  return invitesVisio(parDossier, [(client as { contact_email: string | null } | null)?.contact_email]);
}

/** Adresses des stagiaires inscrits qui en ont une. */
export async function emailsStagiairesDeSeance(sb: Sb, sessionId: string): Promise<string[]> {
  const { data: p } = await sb
    .schema('app')
    .from('session_participants')
    .select('learner_id')
    .eq('session_id', sessionId)
    .eq('participant_kind', 'learner');
  const ids = ((p ?? []) as Array<{ learner_id: string | null }>).map((r) => r.learner_id).filter(Boolean) as string[];
  if (ids.length === 0) return [];
  const { data: l } = await sb.schema('app').from('learners').select('email').in('id', ids);
  return invitesVisio(((l ?? []) as Array<{ email: string | null }>).map((x) => x.email));
}

/**
 * Ce qui part au sujet d'une visio part de la boîte formateur quand elle est
 * connectée : c'est l'adresse que les entreprises et les formateurs
 * connaissent pour les séances. Sinon, l'adresse de l'organisme.
 */
async function expediteurVisio(sb: Sb, organizationId: string): Promise<Expediteur> {
  const [organisme, { data }] = await Promise.all([
    expediteurDeLOrganisme(sb, organizationId),
    sb
      .schema('app')
      .from('organization_google_calendar')
      .select('account_email')
      .eq('organization_id', organizationId)
      .maybeSingle(),
  ]);
  const boite = ((data as { account_email: string | null } | null)?.account_email ?? '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(boite)) return organisme;
  return { ...organisme, from: `${nomAffichable(organisme.nom)} <${boite}>`, email: boite, source: 'organisme' };
}

/**
 * Envoie depuis la boîte formateur. Si le prestataire refuse cette adresse
 * (domaine non vérifié), on renvoie depuis l'adresse du serveur, la réponse
 * revenant toujours à la boîte : mieux vaut un expéditeur moins joli qu'un
 * rappel perdu. Le repli a sa propre clé, la première étant déjà réservée.
 */
export async function envoyerDepuisLaBoite(
  sb: Sb,
  organizationId: string,
  message: Omit<SendEmailInput, 'from' | 'replyTo' | 'organizationId'>,
): Promise<SendEmailResult> {
  const expediteur = await expediteurVisio(sb, organizationId);
  const commun = { ...message, organizationId, ...(expediteur.email ? { replyTo: expediteur.email } : {}) };
  const envoi = await sendEmail({ ...commun, from: expediteur.from });
  if (envoi.ok || envoi.reason !== 'send_failed' || expediteur.source !== 'organisme') return envoi;
  return sendEmail({
    ...commun,
    ...(message.idempotencyKey ? { idempotencyKey: `${message.idempotencyKey}:repli` } : {}),
    metadata: { ...(message.metadata ?? {}), source: 'repli' },
  });
}

export type SeancePourEmail = {
  readonly id: string;
  readonly organizationId: string;
  readonly startsAt: string;
  readonly status: string;
  readonly donnees: SeanceEmailData;
};

export async function seancePourEmail(sb: Sb, sessionId: string): Promise<SeancePourEmail | null> {
  const { data } = await sb
    .schema('app')
    .from('sessions')
    .select('id, organization_id, title, status, starts_at, ends_at, modality, location, remote_url, zoom_join_url, formation_id, dossier_id')
    .eq('id', sessionId)
    .maybeSingle();
  const s = data as {
    id: string;
    organization_id: string;
    title: string | null;
    status: string;
    starts_at: string;
    ends_at: string;
    modality: string;
    location: string | null;
    remote_url: string | null;
    zoom_join_url: string | null;
    formation_id: string | null;
    dossier_id: string | null;
  } | null;
  if (!s) return null;

  let formationId = s.formation_id;
  if (!formationId && s.dossier_id) {
    const { data: d } = await sb.schema('app').from('dossiers').select('formation_id').eq('id', s.dossier_id).maybeSingle();
    formationId = (d as { formation_id: string | null } | null)?.formation_id ?? null;
  }
  const [{ data: f }, { data: o }] = await Promise.all([
    formationId
      ? sb.schema('app').from('formations').select('title').eq('id', formationId).maybeSingle()
      : Promise.resolve({ data: null }),
    sb.schema('app').from('organizations').select('name').eq('id', s.organization_id).maybeSingle(),
  ]);

  return {
    id: s.id,
    organizationId: s.organization_id,
    startsAt: s.starts_at,
    status: s.status,
    donnees: {
      orgName: (o as { name: string | null } | null)?.name ?? 'Votre organisme de formation',
      formationTitle: (f as { title: string } | null)?.title ?? s.title ?? 'Formation',
      quand: `${jourLong(s.starts_at)} · ${heure(s.starts_at)} – ${heure(s.ends_at)}`,
      modalite: s.modality,
      lieu: s.location,
      lienVisio: estADistance(s.modality) ? (s.zoom_join_url ?? s.remote_url) : null,
    },
  };
}

/**
 * Le lien de la visio, à l'entreprise de chaque stagiaire, dès qu'il existe :
 * on n'a pas toujours l'adresse des salariés, c'est elle qui transmet.
 */
export async function diffuserLienVisio(sb: Sb, sessionId: string): Promise<number> {
  const seance = await seancePourEmail(sb, sessionId);
  const lien = seance?.donnees.lienVisio;
  if (!seance || !lien) return 0;

  if (!(await envoiActif(seance.organizationId, 'lien_visio_entreprise'))) return 0;

  let envoyes = 0;
  const { subject, html } = lienVisioEntrepriseEmail({ ...seance.donnees, lienVisio: lien });
  for (const email of await emailsReferentsDeSeance(sb, sessionId)) {
    const r = await envoyerDepuisLaBoite(sb, seance.organizationId, {
      to: email,
      subject,
      html,
      kind: 'lien_visio_entreprise',
      idempotencyKey: `lien_visio_entreprise:${sessionId}:${email.toLowerCase()}:${lien}`,
      metadata: { session_id: sessionId },
    });
    if (r.ok) envoyes += 1;
    else if (r.reason !== 'duplicate') console.error('[visio] lien non envoyé à l’entreprise', sessionId, r.reason);
  }
  return envoyes;
}

/**
 * Crée la visio d'une séance déjà enregistrée, quel que soit son type
 * (dossier, groupe, séance libre) : Meet sur l'agenda de l'organisme, invités
 * stagiaires et formateur, lien noté sur la séance puis envoyé aux entreprises.
 */
export async function creerVisioDeSeance(
  sb: Sb,
  sessionId: string,
  userId: string | null,
): Promise<'created' | 'exists' | 'not_remote' | 'no_calendar' | 'failed'> {
  const { data } = await sb
    .schema('app')
    .from('sessions')
    .select('organization_id, title, starts_at, ends_at, modality, remote_url')
    .eq('id', sessionId)
    .maybeSingle();
  const s = data as {
    organization_id: string;
    title: string | null;
    starts_at: string;
    ends_at: string;
    modality: string;
    remote_url: string | null;
  } | null;
  if (!s) return 'failed';
  if (s.remote_url) return 'exists';
  if (!estADistance(s.modality)) return 'not_remote';

  const organisateur = await organisateurDuMeet(sb, s.organization_id, userId);
  if (!organisateur) return 'no_calendar';
  const seance = await seancePourEmail(sb, sessionId);

  const res = await createMeetEvent(organisateur.creds, {
    title: s.title ?? seance?.donnees.formationTitle ?? 'Séance',
    startsAt: s.starts_at,
    endsAt: s.ends_at,
    attendeeEmails: invitesVisio(
      await emailsStagiairesDeSeance(sb, sessionId),
      await emailsFormateursDeSeance(sb, sessionId),
    ),
    description: seance?.donnees.formationTitle ?? undefined,
  });
  if (!res.ok) return 'failed';

  const { error } = await sb
    .schema('app')
    .from('sessions')
    .update({ remote_url: res.value.meetUrl, zoom_metadata: metadataMeet(res.value.eventId, organisateur.proprietaire) })
    .eq('id', sessionId);
  if (error) return 'failed';

  await diffuserLienVisio(sb, sessionId);
  return 'created';
}
