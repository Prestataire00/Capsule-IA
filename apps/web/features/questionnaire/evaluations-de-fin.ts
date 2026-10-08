import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { randomUUID, createHash } from 'node:crypto';
import { env } from '@/env.mjs';
import { loadSession } from '@/features/sessions/load-session';
import { envoyerDepuisLaBoiteDesCours, envoyerDepuisLOrganisme } from '@/features/sessions/visio';
import { referentsDesDossiers } from '@/features/espace-entreprise/referents';
import { sessionsAutomationOff } from '@/features/automation/session-automations';
import { loadReglesParOrganisme } from '@/features/emails/programmation-store';
import { organisationsQuiOntCoupe } from '@/features/emails/programmation-envois';
import { evaluationsFinFormateurEmail, evaluationsFinReferentEmail, evaluationsFinStagiaireEmail } from '@/shared/lib/email/templates';
import { questionnaireEmail } from '@/shared/lib/email/questionnaire-email';
import { generateQuestionnaireToken } from '@/shared/lib/questionnaire-token';
import { assignationSatisfaction, lienSatisfaction } from './satisfaction';
import { lienStagiaire } from './lien-stagiaire';
import { ensureCompanySatisfactionTemplate } from './satisfaction-entreprise';

/**
 * Les évaluations de fin de formation (point Capsule IA du 05/10/2026) :
 *
 *  • 30 minutes avant la fin de la DERNIÈRE séance d'un dossier, le
 *    questionnaire de satisfaction à chaud et le quiz de fin : le formateur
 *    est prévenu de projeter le QR, et chaque entreprise reçoit en un e-mail
 *    les liens de ses stagiaires SANS adresse, pour les leur transmettre ;
 *  • à la fin de cette séance, chaque stagiaire qui a une adresse reçoit ses
 *    propres liens — sauf s'il a déjà répondu en salle (07/10/2026) ;
 *  • 24 h après cette dernière séance, le questionnaire de satisfaction de
 *    l'entreprise part à son référent.
 *
 * Appelées toutes les 15 minutes ; chaque envoi a sa clé, rien ne part deux fois.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Sb = SupabaseClient<any, any, any>;

type Seance = { id: string; organization_id: string; ends_at: string; dossier_id: string | null; company_id: string | null; formation_id: string | null };

/** Les dossiers dont `seance` est la dernière séance (aucune séance active ne finit après). */
export async function dossiersDontCestLaDerniere(sb: Sb, seance: Seance, dossierIds: readonly string[]): Promise<string[]> {
  const derniers: string[] = [];
  for (const dossierId of dossierIds) {
    const [{ data: liees }, { data: directes }] = await Promise.all([
      sb
        .schema('app')
        .from('session_dossiers')
        .select('session:sessions!inner(id, ends_at, status)')
        .eq('dossier_id', dossierId)
        .gt('session.ends_at', seance.ends_at)
        .neq('session.status', 'cancelled')
        .limit(1),
      sb.schema('app').from('sessions').select('id').eq('dossier_id', dossierId).gt('ends_at', seance.ends_at).neq('status', 'cancelled').limit(1),
    ]);
    if ((liees ?? []).length === 0 && (directes ?? []).length === 0) derniers.push(dossierId);
  }
  return derniers;
}

/** Une séance sans dossier est la dernière quand aucune séance du même client et de la même formation ne finit après. */
async function derniereSeanceDuClient(sb: Sb, seance: Seance): Promise<boolean> {
  let q = sb.schema('app').from('sessions').select('id').is('dossier_id', null).gt('ends_at', seance.ends_at).neq('status', 'cancelled').limit(1);
  q = seance.company_id ? q.eq('company_id' as never, seance.company_id as never) : q.eq('id', seance.id);
  q = seance.formation_id ? q.eq('formation_id' as never, seance.formation_id as never) : q.is('formation_id' as never, null);
  const { data } = await q;
  return (data ?? []).length === 0;
}

const COLONNES = 'id, organization_id, ends_at, dossier_id, company_id, formation_id';

const adresseValide = (email: string | null | undefined): email is string =>
  Boolean(email && email.includes('@') && !email.trim().toLowerCase().endsWith('.invalid'));

/** Les quiz validés de la séance ou de ses dossiers : le quiz de fin. */
async function quizDeFin(sb: Sb, s: Seance, dossierIds: readonly string[]): Promise<Array<{ id: string; title: string }>> {
  const { data } = await sb
    .schema('app')
    .from('exercises' as never)
    .select('id, title')
    .eq('organization_id', s.organization_id)
    .eq('validation_status', 'valide')
    .eq('kind', 'quiz')
    .or(`session_id.eq.${s.id}${dossierIds.length ? `,dossier_id.in.(${dossierIds.join(',')})` : ''}`);
  return (data ?? []) as unknown as Array<{ id: string; title: string }>;
}

export async function lancerEvaluationsDeFin(sb: Sb, maintenant = new Date()): Promise<{ seances: number; sent: number; errors: string[] }> {
  const base = (env.PUBLIC_APP_URL ?? '').replace(/\/$/, '');
  if (!base) return { seances: 0, sent: 0, errors: ['PUBLIC_APP_URL absente'] };
  // Les séances qui finissent dans la demi-heure qui vient (le passage a lieu toutes les 15 minutes).
  const { data, error } = await sb
    .schema('app')
    .from('sessions')
    .select(COLONNES)
    .neq('status', 'cancelled')
    .gt('ends_at', maintenant.toISOString())
    .lte('ends_at', new Date(maintenant.getTime() + 30 * 60_000).toISOString());
  if (error) return { seances: 0, sent: 0, errors: [`lecture des séances : ${error.message}`] };
  const seances = (data ?? []) as unknown as Seance[];
  if (seances.length === 0) return { seances: 0, sent: 0, errors: [] };

  const [coupees, coupes] = await Promise.all([
    sessionsAutomationOff(sb, seances.map((s) => s.id), 'evaluations_fin'),
    loadReglesParOrganisme(sb, 'evaluations_fin').then((r) => organisationsQuiOntCoupe('evaluations_fin', r)),
  ]);

  let sent = 0;
  let traitees = 0;
  const errors: string[] = [];
  for (const s of seances) {
    if (coupees.has(s.id) || coupes.has(s.organization_id)) continue;
    const loaded = await loadSession(sb, s.id);
    if (!loaded) continue;
    const dossiersFinis = await dossiersDontCestLaDerniere(sb, s, loaded.dossierIds);
    const sansDossierFini = loaded.directLearners.length > 0 && (await derniereSeanceDuClient(sb, s));
    if (dossiersFinis.length === 0 && !sansDossierFini) continue;
    traitees += 1;

    const quiz = await quizDeFin(sb, s, loaded.dossierIds);
    const formation = loaded.formation?.title ?? loaded.session.title ?? 'votre formation';

    // Chaque stagiaire de dossier terminé : son lien de satisfaction et ses quiz.
    // Ceux qui ont une adresse reçoivent leurs liens eux-mêmes à la fin
    // (`envoyerEvaluationsAuxStagiaires`) : l'entreprise ne relaie que les autres.
    const stagiaires = loaded.learners.filter((l) => dossiersFinis.includes(l.dossierId) && !adresseValide(l.email));
    const referents = await referentsDesDossiers(sb, stagiaires.map((l) => l.dossierId));
    const parReferent = new Map<string, { prenom: string; liste: Array<{ nom: string; satisfaction: string | null; quiz: Array<{ titre: string; lien: string }> }> }>();
    for (const l of stagiaires) {
      const args = { organizationId: s.organization_id, dossierId: l.dossierId, learnerId: l.id };
      // Déjà rempli en salle (QR projeté) : pas de lien à faire relayer par l'entreprise.
      const { complete } = await assignationSatisfaction(sb, args);
      const satisfaction = complete ? null : await lienSatisfaction(sb, args);
      const liensQuiz = await Promise.all(
        quiz.map(async (q) => ({ titre: q.title, lien: await lienStagiaire(base, 'quiz', { ...args, cibleId: q.id }) })),
      );
      if (!satisfaction && liensQuiz.length === 0) continue;
      const ligne = { nom: `${l.first_name} ${l.last_name}`.trim(), satisfaction, quiz: liensQuiz };
      // Sans référent ni adresse : le QR projeté par le formateur reste le seul chemin.
      const ref = referents.get(l.dossierId);
      if (ref) {
        const g = parReferent.get(ref.email) ?? { prenom: ref.prenom, liste: [] };
        g.liste.push(ligne);
        parReferent.set(ref.email, g);
      }
    }

    const { data: org } = await sb.schema('app').from('organizations').select('name').eq('id', s.organization_id).maybeSingle();
    const organisme = (org as { name: string | null } | null)?.name ?? 'Votre organisme de formation';
    for (const [email, g] of parReferent) {
      const tpl = evaluationsFinReferentEmail({ prenom: g.prenom, formation, organisme, stagiaires: g.liste });
      const r = await envoyerDepuisLOrganisme(sb, s.organization_id, {
        to: email,
        subject: tpl.subject,
        html: tpl.html,
        kind: 'evaluations_fin',
        idempotencyKey: `evaluations_fin:${s.id}:${email}`,
        metadata: { session_id: s.id, stagiaires: g.liste.length },
      });
      if (r.ok) sent += 1;
      else if (r.reason !== 'duplicate' && r.reason !== 'no_api_key') errors.push(`${s.id} → ${email} : ${r.reason}`);
    }
    // Le formateur : projeter le QR de satisfaction, faire le quiz.
    const { data: st } = await sb.schema('app').from('session_trainers').select('trainer:trainers(first_name, email)').eq('session_id', s.id).is('deleted_at', null);
    for (const row of (st ?? []) as unknown as Array<{ trainer: { first_name: string | null; email: string | null } | Array<{ first_name: string | null; email: string | null }> | null }>) {
      const t = Array.isArray(row.trainer) ? row.trainer[0] : row.trainer;
      if (!t?.email) continue;
      const tpl = evaluationsFinFormateurEmail({ prenom: t.first_name ?? '', formation, projection: `${base}/projection/satisfaction/${s.id}`, quiz: quiz.map((q) => q.title) });
      const r = await envoyerDepuisLaBoiteDesCours(sb, s.organization_id, {
        to: t.email,
        subject: tpl.subject,
        html: tpl.html,
        kind: 'evaluations_fin',
        idempotencyKey: `evaluations_fin_formateur:${s.id}:${t.email}`,
        metadata: { session_id: s.id },
      });
      if (r.ok) sent += 1;
      else if (r.reason !== 'duplicate' && r.reason !== 'no_api_key') errors.push(`${s.id} → formateur : ${r.reason}`);
    }
  }
  return { seances: traitees, sent, errors };
}

/**
 * À la fin de la dernière séance d'un dossier, chaque stagiaire qui a une
 * adresse reçoit lui-même son questionnaire de satisfaction à chaud (et le
 * quiz de fin). Celui qui a déjà répondu en salle, sur le QR projeté, ne
 * reçoit rien. Fenêtre de 24 h : un passage manqué se rattrape ; la clé
 * garantit un seul envoi par stagiaire et par séance.
 */
export async function envoyerEvaluationsAuxStagiaires(
  sb: Sb,
  maintenant = new Date(),
): Promise<{ seances: number; sent: number; errors: string[] }> {
  const base = (env.PUBLIC_APP_URL ?? '').replace(/\/$/, '');
  if (!base) return { seances: 0, sent: 0, errors: ['PUBLIC_APP_URL absente'] };
  const { data, error } = await sb
    .schema('app')
    .from('sessions')
    .select(COLONNES)
    .neq('status', 'cancelled')
    .lte('ends_at', maintenant.toISOString())
    .gt('ends_at', new Date(maintenant.getTime() - 24 * 3600_000).toISOString());
  if (error) return { seances: 0, sent: 0, errors: [`lecture des séances : ${error.message}`] };
  const seances = (data ?? []) as unknown as Seance[];
  if (seances.length === 0) return { seances: 0, sent: 0, errors: [] };

  const [coupees, coupes] = await Promise.all([
    sessionsAutomationOff(sb, seances.map((s) => s.id), 'evaluations_fin'),
    loadReglesParOrganisme(sb, 'evaluations_fin').then((r) => organisationsQuiOntCoupe('evaluations_fin', r)),
  ]);

  let sent = 0;
  let traitees = 0;
  const errors: string[] = [];
  for (const s of seances) {
    if (coupees.has(s.id) || coupes.has(s.organization_id)) continue;
    const loaded = await loadSession(sb, s.id);
    if (!loaded) continue;
    const dossiersFinis = await dossiersDontCestLaDerniere(sb, s, loaded.dossierIds);
    const stagiaires = loaded.learners.filter((l) => dossiersFinis.includes(l.dossierId) && adresseValide(l.email));
    if (stagiaires.length === 0) continue;
    traitees += 1;

    const quiz = await quizDeFin(sb, s, loaded.dossierIds);
    const formation = loaded.formation?.title ?? loaded.session.title ?? 'votre formation';
    const { data: org } = await sb.schema('app').from('organizations').select('name').eq('id', s.organization_id).maybeSingle();
    const organisme = (org as { name: string | null } | null)?.name ?? 'Votre organisme de formation';

    for (const l of stagiaires) {
      const args = { organizationId: s.organization_id, dossierId: l.dossierId, learnerId: l.id };
      const { complete } = await assignationSatisfaction(sb, args);
      const satisfaction = complete ? null : await lienSatisfaction(sb, args);
      const liensQuiz = await Promise.all(
        quiz.map(async (q) => ({ titre: q.title, lien: await lienStagiaire(base, 'quiz', { ...args, cibleId: q.id }) })),
      );
      // Déjà répondu en salle et aucun quiz : rien à lui demander.
      if (!satisfaction && liensQuiz.length === 0) continue;
      const tpl = evaluationsFinStagiaireEmail({ prenom: l.first_name, formation, organisme, satisfaction, quiz: liensQuiz });
      const r = await envoyerDepuisLOrganisme(sb, s.organization_id, {
        to: l.email,
        subject: tpl.subject,
        html: tpl.html,
        kind: 'evaluations_fin',
        dossierId: l.dossierId,
        idempotencyKey: `evaluations_fin_stagiaire:${s.id}:${l.id}`,
        metadata: { session_id: s.id, learner_id: l.id },
      });
      if (r.ok) sent += 1;
      else if (r.reason !== 'duplicate' && r.reason !== 'no_api_key') errors.push(`${s.id} → stagiaire ${l.id} : ${r.reason}`);
    }
  }
  return { seances: traitees, sent, errors };
}

/**
 * 24 h après la dernière séance d'un dossier d'entreprise, le questionnaire
 * de satisfaction de l'entreprise part à son référent — automatiquement, et
 * non plus seulement à la main depuis le dossier.
 */
export async function envoyerSatisfactionEntreprises(sb: Sb, maintenant = new Date()): Promise<{ dossiers: number; sent: number; errors: string[] }> {
  const base = (env.PUBLIC_APP_URL ?? '').replace(/\/$/, '');
  if (!base) return { dossiers: 0, sent: 0, errors: ['PUBLIC_APP_URL absente'] };
  // Fenêtre large (24 à 72 h) : un passage manqué se rattrape ; la clé garantit un seul envoi par dossier.
  const { data, error } = await sb
    .schema('app')
    .from('sessions')
    .select(COLONNES)
    .neq('status', 'cancelled')
    .lte('ends_at', new Date(maintenant.getTime() - 24 * 3600_000).toISOString())
    .gt('ends_at', new Date(maintenant.getTime() - 72 * 3600_000).toISOString());
  if (error) return { dossiers: 0, sent: 0, errors: [`lecture des séances : ${error.message}`] };
  const seances = (data ?? []) as unknown as Seance[];
  if (seances.length === 0) return { dossiers: 0, sent: 0, errors: [] };

  const [coupees, coupes] = await Promise.all([
    sessionsAutomationOff(sb, seances.map((s) => s.id), 'satisfaction_entreprise'),
    loadReglesParOrganisme(sb, 'satisfaction_entreprise').then((r) => organisationsQuiOntCoupe('satisfaction_entreprise', r)),
  ]);

  let dossiers = 0;
  let sent = 0;
  const errors: string[] = [];
  const templateId = await ensureCompanySatisfactionTemplate(sb);
  for (const s of seances) {
    if (coupees.has(s.id) || coupes.has(s.organization_id)) continue;
    const loaded = await loadSession(sb, s.id);
    if (!loaded) continue;
    const finis = await dossiersDontCestLaDerniere(sb, s, loaded.dossierIds);
    if (finis.length === 0) continue;
    const { data: ds } = await sb.schema('app').from('dossiers').select('id, company_id, contact_id').in('id', finis);
    const avecEntreprise = ((ds ?? []) as Array<{ id: string; company_id: string | null; contact_id: string | null }>).filter((d) => d.company_id);
    if (avecEntreprise.length === 0) continue;
    const referents = await referentsDesDossiers(sb, avecEntreprise.map((d) => d.id));
    const { data: org } = await sb.schema('app').from('organizations').select('name').eq('id', s.organization_id).maybeSingle();

    for (const d of avecEntreprise) {
      const ref = referents.get(d.id);
      if (!ref) continue;
      dossiers += 1;
      // Une assignation par dossier et par entreprise : la même si elle existe déjà.
      const { data: existante } = await sb
        .schema('app')
        .from('questionnaire_assignments')
        .select('id, status')
        .eq('template_id', templateId)
        .eq('dossier_id', d.id)
        .eq('recipient_kind', 'company_rep' as never)
        .neq('status', 'expired')
        .limit(1)
        .maybeSingle();
      const deja = existante as { id: string; status: string } | null;
      if (deja?.status === 'completed') continue;
      // Déjà parti : ne pas régénérer le jeton, le lien reçu par le client resterait sinon invalide.
      const cle = `satisfaction_entreprise:${d.id}`;
      const { data: dejaParti } = await sb.schema('app').from('email_log' as never).select('id').eq('idempotency_key', cle).limit(1).maybeSingle();
      if (dejaParti) continue;
      let assignmentId = deja?.id ?? null;
      if (!assignmentId) {
        const { data: creee, error: e } = await sb
          .schema('app')
          .from('questionnaire_assignments')
          .insert({
            organization_id: s.organization_id,
            template_id: templateId,
            dossier_id: d.id,
            recipient_kind: 'company_rep',
            recipient_contact_id: ref.contactId,
            recipient_email: ref.email,
            recipient_name: ref.prenom || null,
            token_hash: `pending-${randomUUID()}`,
            status: 'pending',
          } as never)
          .select('id')
          .single();
        if (e || !creee) {
          errors.push(`${d.id} : assignation non créée (${e?.message})`);
          continue;
        }
        assignmentId = (creee as { id: string }).id;
      }
      const signed = await generateQuestionnaireToken({ assignmentId, dossierId: d.id, organizationId: s.organization_id });
      await sb
        .schema('app')
        .from('questionnaire_assignments')
        .update({ token_hash: createHash('sha256').update(signed.token).digest('hex') } as never)
        .eq('id', assignmentId);
      const tpl = questionnaireEmail({
        destinataire: 'entreprise',
        prenom: ref.prenom || null,
        titreQuestionnaire: 'Votre retour sur la formation',
        formationTitle: loaded.formation?.title ?? loaded.session.title ?? null,
        organisme: (org as { name: string | null } | null)?.name ?? 'Votre organisme de formation',
        url: `${base}/questionnaire/entreprise/${signed.token}`,
      });
      const r = await envoyerDepuisLOrganisme(sb, s.organization_id, {
        to: ref.email,
        subject: tpl.subject,
        html: tpl.html,
        kind: 'satisfaction_entreprise',
        dossierId: d.id,
        idempotencyKey: cle,
        metadata: { session_id: s.id, assignment_id: assignmentId },
      });
      if (r.ok) sent += 1;
      else if (r.reason !== 'duplicate' && r.reason !== 'no_api_key') errors.push(`${d.id} : ${r.reason}`);
    }
  }
  return { dossiers, sent, errors };
}
