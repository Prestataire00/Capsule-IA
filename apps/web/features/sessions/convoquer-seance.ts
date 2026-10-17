// ARCHETYPE: shared
// Convocation des stagiaires d'une séance. Sortie du cron J-7 pour servir aussi
// quand les horaires changent : deux copies de cette logique auraient fini par
// convoquer les entreprises par un chemin et pas par l'autre.

import type { SupabaseClient } from '@supabase/supabase-js';
import { sendEmail } from '@/shared/lib/email/resend';
import { sessionConvocationEmail } from '@/shared/lib/email/templates';
import { destinatairesConvocation, mentionEntreprise } from '@/features/documents/convocation-destinataires';
import { archiverDocument } from '@/features/documents/archiver-automatiquement';

export type SeanceAConvoquer = {
  id: string;
  starts_at: string;
  ends_at: string;
  modality: string;
  location: string | null;
  remote_url: string | null;
  dossier_id: string | null;
  organization_id: string;
  formation_id?: string | null;
};

export type ConvocationResultat = { sent: number; errors: string[] };

type LearnerRow = { id: string; first_name: string; last_name: string; email: string | null };

const heureParis = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

/** Heure locale de Paris : le serveur tourne en UTC, `getHours()` décalait d'une à deux heures. */
export const heureLocale = (iso: string): string => heureParis.format(new Date(iso));

/**
 * Stagiaires qui ont déjà reçu une convocation pour cette séance : la sienne
 * seule (ancienne forme), ou celle de toute la formation qui la comprenait.
 */
export async function stagiairesDejaConvoques(sb: SupabaseClient, sessionId: string): Promise<Set<string>> {
  const prefixe = `convocation_j7:${sessionId}:`;
  const [{ data, error }, { data: formation, error: e2 }] = await Promise.all([
    sb.schema('app').from('email_log').select('idempotency_key').like('idempotency_key', `${prefixe}%`).eq('status', 'sent'),
    sb
      .schema('app')
      .from('email_log')
      .select('metadata')
      .like('idempotency_key', 'convocation_formation:%')
      .contains('metadata', { session_ids: [sessionId] })
      .eq('status', 'sent'),
  ]);
  if (error ?? e2) console.error('[convocation] journal illisible', sessionId, (error ?? e2)?.message);
  return new Set([
    ...((data ?? []) as Array<{ idempotency_key: string | null }>).map((r) => r.idempotency_key?.slice(prefixe.length) ?? '').filter(Boolean),
    ...((formation ?? []) as Array<{ metadata: { learner_id?: string } | null }>).map((r) => r.metadata?.learner_id ?? '').filter(Boolean),
  ]);
}

type SeanceDuStagiaire = { id: string; debut: string; fin: string; modality: string; location: string | null; remoteUrl: string | null };

/**
 * Les séances du stagiaire dans cette formation (son dossier, sinon la même
 * formation), non annulées : ce que liste sa convocation unique.
 */
async function seancesDuStagiaire(
  sb: SupabaseClient,
  learnerId: string,
  dossierId: string | null,
  formationId: string | null,
): Promise<SeanceDuStagiaire[]> {
  const { data: parts } = await sb
    .schema('app')
    .from('session_participants')
    .select('session_id, source')
    .eq('learner_id', learnerId)
    .eq('participant_kind', 'learner');
  const ids = ((parts ?? []) as Array<{ session_id: string; source: string | null }>).filter((p) => p.source !== 'manual_remove').map((p) => p.session_id);
  if (ids.length === 0) return [];
  const [{ data: seances }, { data: liens }] = await Promise.all([
    sb.schema('app').from('sessions').select('id, starts_at, ends_at, modality, location, remote_url, zoom_join_url, formation_id, dossier_id, status').in('id', ids).neq('status', 'cancelled'),
    dossierId ? sb.schema('app').from('session_dossiers').select('session_id').eq('dossier_id', dossierId) : Promise.resolve({ data: [] }),
  ]);
  const duDossier = new Set(((liens ?? []) as Array<{ session_id: string }>).map((l) => l.session_id));
  return (
    (seances ?? []) as Array<{
      id: string;
      starts_at: string;
      ends_at: string;
      modality: string;
      location: string | null;
      remote_url: string | null;
      zoom_join_url: string | null;
      formation_id: string | null;
      dossier_id: string | null;
    }>
  )
    .filter((x) => (dossierId && (x.dossier_id === dossierId || duDossier.has(x.id))) || (formationId && x.formation_id === formationId))
    .map((x) => ({ id: x.id, debut: x.starts_at, fin: x.ends_at, modality: x.modality, location: x.location, remoteUrl: x.zoom_join_url ?? x.remote_url }))
    .sort((a, b) => a.debut.localeCompare(b.debut));
}

/** La convocation de formation déjà partie pour ce stagiaire, et les séances qu'elle couvrait. */
async function convocationFormationEnvoyee(sb: SupabaseClient, cle: string): Promise<string[] | null> {
  const { data } = await sb.schema('app').from('email_log').select('metadata').eq('idempotency_key', cle).eq('status', 'sent').limit(1).maybeSingle();
  const m = (data as { metadata: { session_ids?: string[] } | null } | null)?.metadata;
  return m ? (m.session_ids ?? []) : null;
}

/**
 * Convoque les stagiaires d'une séance et archive la convocation dans chaque dossier.
 *
 * `modification` : la séance a changé de date ou d'horaires ; l'e-mail le dit, et
 * la clé d'unicité porte le nouveau début pour qu'un second changement reparte.
 * `seulement` restreint l'envoi à ces stagiaires — ceux qui avaient l'ancienne version.
 * `copieEntreprise` : `si_sans_adresse` quand l'entreprise reçoit la convocation
 * de groupe — elle n'est alors en copie que des stagiaires sans adresse.
 */
export async function convoquerSeance(
  sb: SupabaseClient,
  session: SeanceAConvoquer,
  opts: { modification?: boolean; seulement?: ReadonlySet<string>; copieEntreprise?: 'toujours' | 'si_sans_adresse' } = {},
): Promise<ConvocationResultat> {
  const errors: string[] = [];
  let sent = 0;

  const { data: participants } = await sb
    .schema('app')
    .from('session_participants')
    .select('learner_id, trainer_id, participant_kind')
    .eq('session_id', session.id);
  const rows = (participants ?? []) as Array<{ participant_kind: string; learner_id: string | null; trainer_id: string | null }>;
  const learnerIds = rows
    .filter((p) => p.participant_kind === 'learner' && p.learner_id)
    .map((p) => p.learner_id as string)
    .filter((id) => !opts.seulement || opts.seulement.has(id));
  const trainerIds = rows.filter((p) => p.participant_kind === 'trainer' && p.trainer_id).map((p) => p.trainer_id as string);
  if (learnerIds.length === 0) return { sent, errors };

  // Dossiers de la séance : rattachement direct, ou table de liaison pour une
  // séance de groupe. Chaque convocation part avec le dossier de SON apprenant
  // (preuve indicateur 9).
  const { data: links } = await sb.schema('app').from('session_dossiers').select('dossier_id').eq('session_id', session.id);
  const sessionDossierIds = [
    ...new Set(
      [session.dossier_id, ...((links ?? []) as Array<{ dossier_id: string }>).map((l) => l.dossier_id)].filter(
        (v): v is string => Boolean(v),
      ),
    ),
  ];
  const { data: dRows } = sessionDossierIds.length
    ? await sb.schema('app').from('dossiers').select('id, learner_id, formation_id, company_id').in('id', sessionDossierIds)
    : { data: [] };
  const sessionDossiers = (dRows ?? []) as Array<{ id: string; learner_id: string; formation_id: string | null; company_id: string | null }>;

  // L'entreprise reçoit toutes les convocations de ses inscrits (filet de sécurité).
  const companyIds = [...new Set(sessionDossiers.map((d) => d.company_id).filter((x): x is string => Boolean(x)))];
  const { data: companyRows } = companyIds.length
    ? await sb.schema('app').from('companies').select('id, contact_email').in('id', companyIds)
    : { data: [] };
  const emailEntreprise = new Map(
    ((companyRows ?? []) as Array<{ id: string; contact_email: string | null }>).map((c) => [c.id, c.contact_email]),
  );
  const dossierParLearner = new Map(sessionDossiers.map((d) => [d.learner_id, d]));
  const formationId = session.formation_id ?? sessionDossiers.find((d) => d.formation_id)?.formation_id ?? null;

  const { data: formationRow } = formationId
    ? await sb.schema('app').from('formations').select('title').eq('id', formationId).maybeSingle()
    : { data: null };
  const formationTitle = (formationRow as { title: string } | null)?.title ?? 'Votre formation';

  let trainerName: string | null = null;
  if (trainerIds.length > 0) {
    const { data: tRow } = await sb.schema('app').from('trainers').select('first_name, last_name').eq('id', trainerIds[0]).maybeSingle();
    const t = tRow as { first_name: string; last_name: string } | null;
    if (t) trainerName = `${t.first_name} ${t.last_name}`;
  }

  const { data: learnersRow } = await sb.schema('app').from('learners').select('id, first_name, last_name, email').in('id', learnerIds);
  const learners = (learnersRow ?? []) as unknown as LearnerRow[];

  for (const learner of learners) {
    try {
      const dossierDuLearner = dossierParLearner.get(learner.id);
      // Une seule convocation pour toute la formation (16/10/2026) : elle
      // part avec la première séance due et liste toutes les dates. Une séance
      // ajoutée après coup, absente de cette convocation, reçoit la sienne.
      let seances: SeanceDuStagiaire[] | undefined;
      let cleFormation: string | null = null;
      if (!opts.modification) {
        cleFormation = `convocation_formation:${dossierDuLearner?.id ?? formationId ?? session.id}:${learner.id}`;
        const dejaCouvertes = await convocationFormationEnvoyee(sb, cleFormation);
        if (dejaCouvertes?.includes(session.id)) continue;
        if (dejaCouvertes) cleFormation = null;
        else seances = await seancesDuStagiaire(sb, learner.id, dossierDuLearner?.id ?? null, formationId);
      }
      const tpl = sessionConvocationEmail({
        firstName: learner.first_name,
        formationTitle,
        sessionDate: session.starts_at,
        sessionStartTime: heureLocale(session.starts_at),
        sessionEndTime: heureLocale(session.ends_at),
        modality: session.modality,
        location: session.location,
        remoteUrl: session.remote_url,
        trainerName,
        modification: opts.modification,
        ...(seances && seances.length > 1 ? { seances } : {}),
      });
      const cible = destinatairesConvocation({
        learnerEmail: learner.email,
        companyEmail: dossierDuLearner?.company_id ? (emailEntreprise.get(dossierDuLearner.company_id) ?? null) : null,
        copieEntreprise: opts.copieEntreprise,
      });
      // Ni le stagiaire ni son entreprise n'ont d'adresse : rien à envoyer,
      // mais il faut le dire — une convocation muette n'est pas une preuve.
      if (cible.injoignable) {
        errors.push(`convocation ${session.id} / ${learner.first_name} ${learner.last_name}: sans destinataire`);
        continue;
      }
      const corps = cible.viaEntreprise
        ? `${tpl.html}<p style="color:#64748b;font-size:13px">${mentionEntreprise(`${learner.first_name} ${learner.last_name}`, !learner.email)}</p>`
        : tpl.html;

      const r = await sendEmail({
        to: cible.destinataires,
        subject: tpl.subject,
        html: corps,
        organizationId: session.organization_id,
        dossierId: dossierDuLearner?.id,
        kind: opts.modification ? 'convocation_modifiee' : 'convocation_j7',
        // Une convocation par formation et par apprenant ; une séance ajoutée
        // depuis a la sienne ; une mise à jour par nouveau début, pour qu'un
        // second changement reparte aussi.
        idempotencyKey: opts.modification
          ? `convocation_modifiee:${session.id}:${learner.id}:${session.starts_at}:${session.ends_at}`
          : cleFormation && seances && seances.length > 1
            ? cleFormation
            : `convocation_j7:${session.id}:${learner.id}`,
        metadata: {
          learner_id: learner.id,
          session_ids: seances && seances.length > 1 ? seances.map((x) => x.id) : [session.id],
        },
      });
      if (r.ok) sent++;
      else if (r.reason !== 'no_api_key' && r.reason !== 'duplicate')
        errors.push(`convocation ${session.id} / ${cible.destinataires.join(', ')}: send_failed`);
    } catch (e) {
      errors.push(`convocation ${session.id} / ${learner.email}: ${(e as Error).message}`);
    }
  }

  // La convocation est archivée une fois par dossier, quel que soit le sort des
  // envois : c'est la pièce que l'audit réclame. Idempotent par sourceKey —
  // après un changement d'horaires, elle remplace l'ancienne version.
  for (const dossierId of new Set(sessionDossiers.map((d) => d.id))) {
    const a = await archiverDocument(sb, { type: 'convocation', dossierId, sessionId: session.id });
    if (!a.ok) errors.push(`convocation ${session.id}: archivage — ${a.raison}`);
  }

  return { sent, errors };
}
