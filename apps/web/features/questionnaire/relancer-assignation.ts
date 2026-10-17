import 'server-only';
// Relancer UN questionnaire resté sans réponse, quel que soit son destinataire.
//
// Écrit une fois pour le bouton « Relancer » du dossier et pour la relance
// automatique à J+3 : deux copies auraient fini par envoyer des liens
// différents à la même personne. L'assignation n'est jamais recréée — c'est la
// même, avec un lien qui mène à la même réponse.

import { createHash } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { env } from '@/env.mjs';
import { sendEmail } from '@/shared/lib/email/resend';
import { questionnaireEmail, type DestinataireQuestionnaire } from '@/shared/lib/email/questionnaire-email';
import { expediteurDeLOrganisme } from '@/shared/lib/email/expediteur-organisme';
import { generateQuestionnaireToken } from '@/shared/lib/questionnaire-token';
import { generateSatisfactionUrl } from '@/shared/lib/satisfaction-token';
import { generateTrainerSatisfactionUrl } from '@/shared/lib/trainer-satisfaction-token';
import { TRAINER_SAT_TEMPLATE_CODE } from './satisfaction-formateur';
import { RATTRAPAGE_JOURS, aRelancer, cleRelance, estSatisfaction } from './relance-satisfaction';
import { loadReglesParOrganisme } from '@/features/emails/programmation-store';
import { REGLABLES, reglageEffectif } from '@/features/emails/programmation-envois';
import { lienStagiaire } from './lien-stagiaire';
import { referentsDesDossiers } from '@/features/espace-entreprise/referents';
import { liensStagiairesReferentEmail } from '@/shared/lib/email/templates';
import { adresseDuDestinataire } from './adresse-du-destinataire';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Client = SupabaseClient<any, any, any>;

export type RelanceResultat = { ok: true; email: string } | { ok: false; raison: string };

/** Le modèle système de satisfaction à chaud : sa page publique n'affiche que lui. */
const SATISFACTION_STAGIAIRE_CODE = 'satisfaction_chaud_default';

const DESTINATAIRE: Record<string, DestinataireQuestionnaire> = {
  learner: 'apprenant',
  trainer: 'formateur',
  company_rep: 'entreprise',
  funder: 'financeur',
};

export async function relancerAssignation(
  sb: Client,
  assignmentId: string,
  opts: { automatique: boolean; idempotencyKey?: string },
): Promise<RelanceResultat> {
  const { data: row } = await sb
    .schema('app')
    .from('questionnaire_assignments')
    .select('id, organization_id, dossier_id, status, recipient_kind, recipient_email, recipient_name, recipient_learner_id, recipient_trainer_id, recipient_contact_id, template:questionnaire_templates(title, code)')
    .eq('id', assignmentId)
    .maybeSingle();
  const a = row as unknown as {
    id: string;
    organization_id: string;
    dossier_id: string | null;
    status: string;
    recipient_kind: string;
    recipient_email: string | null;
    recipient_name: string | null;
    recipient_learner_id: string | null;
    recipient_contact_id: string | null;
    recipient_trainer_id: string | null;
    template: { title: string; code: string | null } | { title: string; code: string | null }[] | null;
  } | null;
  if (!a) return { ok: false, raison: 'Questionnaire introuvable.' };
  // Relancer quelqu'un qui a répondu est la meilleure façon de ne plus jamais
  // obtenir de réponse.
  if (a.status === 'completed') return { ok: false, raison: 'Déjà répondu — rien à relancer.' };
  if (!a.dossier_id) return { ok: false, raison: 'Questionnaire sans dossier.' };
  const modele = Array.isArray(a.template) ? a.template[0] : a.template;

  const base = env.PUBLIC_APP_URL?.trim().replace(/\/$/, '') ?? '';
  if (!base) return { ok: false, raison: 'Adresse publique de l’application non configurée.' };

  // Un stagiaire est relancé par son entreprise : un e-mail au référent, avec
  // le lien personnel du stagiaire à lui transmettre.
  if (a.recipient_kind === 'learner' && a.recipient_learner_id) {
    const [referents, { data: l }, expediteur] = await Promise.all([
      referentsDesDossiers(sb, [a.dossier_id]),
      sb.schema('app').from('learners').select('first_name, last_name').eq('id', a.recipient_learner_id).maybeSingle(),
      expediteurDeLOrganisme(sb, a.organization_id),
    ]);
    const ref = referents.get(a.dossier_id);
    if (!ref) return { ok: false, raison: 'Ce dossier n’a ni référent ni contact d’entreprise à qui écrire.' };
    const { nom, lien } = await lienDuStagiaire(sb, {
      assignmentId: a.id,
      dossierId: a.dossier_id,
      organizationId: a.organization_id,
      learnerId: a.recipient_learner_id,
      code: modele?.code ?? null,
      nomParDefaut: a.recipient_name,
      prenomNom: l as { first_name: string | null; last_name: string | null } | null,
    }, base);
    const tpl = liensStagiairesReferentEmail({
      prenom: ref.prenom,
      objet: `Rappel — « ${modele?.title ?? 'Questionnaire'} » pour ${nom}`,
      intro: `${nom} n’a pas encore répondu à « ${modele?.title ?? 'son questionnaire'} ». Pourriez-vous lui transmettre son lien ?`,
      stagiaires: [{ nom, lien }],
      organisme: expediteur.nom,
      libelleLien: 'son questionnaire',
    });
    const r = await sendEmail({
      to: ref.email,
      from: expediteur.from,
      ...(expediteur.email ? { replyTo: expediteur.email } : {}),
      subject: tpl.subject,
      html: tpl.html,
      organizationId: a.organization_id,
      dossierId: a.dossier_id,
      kind: opts.automatique ? 'relance_satisfaction' : 'relance_questionnaire',
      metadata: { assignment_id: a.id, via: 'referent' },
      ...(opts.idempotencyKey ? { idempotencyKey: opts.idempotencyKey } : {}),
    });
    if (!r.ok) return { ok: false, raison: r.reason === 'duplicate' ? 'Déjà relancé.' : 'L’e-mail n’est pas parti.' };
    return { ok: true, email: ref.email };
  }

  const email = await adresseDuDestinataire(sb, a);
  if (!email) return { ok: false, raison: 'Aucune adresse enregistrée pour ce destinataire.' };
  if (email !== a.recipient_email) {
    await sb.schema('app').from('questionnaire_assignments').update({ recipient_email: email } as never).eq('id', a.id);
  }

  // Le lien, par le chemin qui convient au destinataire et au modèle.
  const ctx = { assignmentId: a.id, dossierId: a.dossier_id, organizationId: a.organization_id };
  let url: string;
  if (a.recipient_kind === 'trainer' && a.recipient_trainer_id && modele?.code === TRAINER_SAT_TEMPLATE_CODE) {
    url = (await generateTrainerSatisfactionUrl({ ...ctx, trainerId: a.recipient_trainer_id }, base)).url;
  } else if (a.recipient_kind !== 'learner') {
    const signed = await generateQuestionnaireToken(ctx);
    await sb
      .schema('app')
      .from('questionnaire_assignments')
      .update({ token_hash: createHash('sha256').update(signed.token).digest('hex') } as never)
      .eq('id', a.id);
    url = `${base}/questionnaire/${a.recipient_kind === 'company_rep' ? 'entreprise' : 'financeur'}/${signed.token}`;
  } else {
    return { ok: false, raison: 'Stagiaire introuvable.' };
  }

  const [{ data: d }, expediteur] = await Promise.all([
    sb.schema('app').from('dossiers').select('formation:formations(title)').eq('id', a.dossier_id).maybeSingle(),
    expediteurDeLOrganisme(sb, a.organization_id),
  ]);
  const f = (d as { formation?: { title: string } | { title: string }[] | null } | null)?.formation;
  const formation = Array.isArray(f) ? f[0] : f;

  const tpl = questionnaireEmail({
    destinataire: DESTINATAIRE[a.recipient_kind] ?? 'financeur',
    prenom: a.recipient_name?.split(' ')[0] ?? null,
    titreQuestionnaire: modele?.title ?? 'Questionnaire',
    formationTitle: formation?.title ?? null,
    organisme: expediteur.nom,
    url,
    relance: true,
  });
  const r = await sendEmail({
    to: email,
    from: expediteur.from,
    ...(expediteur.email ? { replyTo: expediteur.email } : {}),
    subject: tpl.subject,
    html: tpl.html,
    organizationId: a.organization_id,
    dossierId: a.dossier_id,
    kind: opts.automatique ? 'relance_satisfaction' : 'relance_questionnaire',
    metadata: { assignment_id: a.id },
    ...(opts.idempotencyKey ? { idempotencyKey: opts.idempotencyKey } : {}),
  });
  if (!r.ok) return { ok: false, raison: r.reason === 'duplicate' ? 'Déjà relancé.' : 'L’e-mail n’est pas parti.' };
  return { ok: true, email };
}

/** Le nom du stagiaire et SON lien, par le chemin qui convient au modèle. */
async function lienDuStagiaire(
  sb: Client,
  a: {
    assignmentId: string;
    dossierId: string;
    organizationId: string;
    learnerId: string;
    code: string | null;
    nomParDefaut: string | null;
    prenomNom: { first_name: string | null; last_name: string | null } | null;
  },
  base: string,
): Promise<{ nom: string; lien: string }> {
  const lien =
    a.code === SATISFACTION_STAGIAIRE_CODE
      ? (await generateSatisfactionUrl({ assignmentId: a.assignmentId, dossierId: a.dossierId, organizationId: a.organizationId, learnerId: a.learnerId }, base)).url
      : await lienStagiaire(base, 'questionnaire', {
          learnerId: a.learnerId,
          organizationId: a.organizationId,
          dossierId: a.dossierId,
          cibleId: a.assignmentId,
        });
  const nom = `${a.prenomNom?.first_name ?? ''} ${a.prenomNom?.last_name ?? ''}`.trim() || a.nomParDefaut || 'Votre stagiaire';
  return { nom, lien };
}

/**
 * Les stagiaires d'un même référent, pour un même questionnaire, relancés en
 * UN e-mail qui les liste avec leur lien (réunion avec Laurie, 16/10/2026 :
 * Nathanaël recevait un e-mail par stagiaire). Un stagiaire déjà relancé n'y
 * figure plus ; chacun est marqué relancé une fois l'e-mail parti.
 */
async function relancerParReferent(
  sb: Client,
  lignes: ReadonlyArray<{ id: string; organization_id: string; dossier_id: string; template_id: string; recipient_learner_id: string; recipient_name: string | null; reminders_sent: number | null }>,
): Promise<{ sent: number; errors: string[] }> {
  const errors: string[] = [];
  const base = env.PUBLIC_APP_URL?.trim().replace(/\/$/, '') ?? '';
  if (!base || lignes.length === 0) return { sent: 0, errors };

  // Déjà relancés, à l'ancienne (un e-mail chacun) ou depuis : on ne les relance plus.
  const { data: dejaLog } = await sb
    .schema('app')
    .from('email_log' as never)
    .select('idempotency_key')
    .in('idempotency_key' as never, lignes.map((l) => cleRelance(l.id)) as never);
  const deja = new Set(((dejaLog ?? []) as Array<{ idempotency_key: string }>).map((r) => r.idempotency_key));
  const aFaire = lignes.filter((l) => !deja.has(cleRelance(l.id)) && !(l.reminders_sent && l.reminders_sent > 0));
  if (aFaire.length === 0) return { sent: 0, errors };

  const [referents, { data: stagiaires }, { data: modeles }] = await Promise.all([
    referentsDesDossiers(sb, aFaire.map((l) => l.dossier_id)),
    sb.schema('app').from('learners').select('id, first_name, last_name').in('id', [...new Set(aFaire.map((l) => l.recipient_learner_id))]),
    sb.schema('app').from('questionnaire_templates').select('id, title, code').in('id', [...new Set(aFaire.map((l) => l.template_id))]),
  ]);
  const personne = new Map(((stagiaires ?? []) as Array<{ id: string; first_name: string | null; last_name: string | null }>).map((x) => [x.id, x]));
  const modele = new Map(((modeles ?? []) as Array<{ id: string; title: string; code: string | null }>).map((x) => [x.id, x]));

  const groupes = new Map<string, { ref: { email: string; prenom: string }; organizationId: string; dossierId: string; templateId: string; membres: typeof aFaire }>();
  for (const l of aFaire) {
    const ref = referents.get(l.dossier_id);
    if (!ref) continue;
    const cle = `${l.organization_id}|${ref.email}|${l.template_id}`;
    const g = groupes.get(cle) ?? { ref, organizationId: l.organization_id, dossierId: l.dossier_id, templateId: l.template_id, membres: [] };
    g.membres = [...g.membres, l];
    groupes.set(cle, g);
  }

  let sent = 0;
  for (const g of groupes.values()) {
    try {
      const m = modele.get(g.templateId);
      const liste = await Promise.all(
        g.membres.map((l) =>
          lienDuStagiaire(sb, {
            assignmentId: l.id,
            dossierId: l.dossier_id,
            organizationId: l.organization_id,
            learnerId: l.recipient_learner_id,
            code: m?.code ?? null,
            nomParDefaut: l.recipient_name,
            prenomNom: personne.get(l.recipient_learner_id) ?? null,
          }, base),
        ),
      );
      liste.sort((x, y) => x.nom.localeCompare(y.nom, 'fr'));
      const titre = m?.title ?? 'Questionnaire';
      const expediteur = await expediteurDeLOrganisme(sb, g.organizationId);
      const tpl = liensStagiairesReferentEmail({
        prenom: g.ref.prenom,
        objet: liste.length > 1 ? `Rappel — « ${titre} » : ${liste.length} stagiaires n’ont pas répondu` : `Rappel — « ${titre} » pour ${liste[0]?.nom ?? 'votre stagiaire'}`,
        intro:
          liste.length > 1
            ? `Voici les stagiaires qui n’ont pas encore répondu à « ${titre} ». Pourriez-vous transmettre à chacun son lien ?`
            : `${liste[0]?.nom ?? 'Votre stagiaire'} n’a pas encore répondu à « ${titre} ». Pourriez-vous lui transmettre son lien ?`,
        stagiaires: liste,
        organisme: expediteur.nom,
        libelleLien: 'son questionnaire',
      });
      const ids = g.membres.map((l) => l.id).sort();
      const r = await sendEmail({
        to: g.ref.email,
        from: expediteur.from,
        ...(expediteur.email ? { replyTo: expediteur.email } : {}),
        subject: tpl.subject,
        html: tpl.html,
        organizationId: g.organizationId,
        dossierId: g.dossierId,
        kind: 'relance_satisfaction',
        metadata: { assignment_ids: ids, via: 'referent', stagiaires: ids.length },
        idempotencyKey: `relance_referent:${createHash('sha256').update(ids.join(',')).digest('hex').slice(0, 32)}`,
      });
      if (!r.ok) {
        if (r.reason !== 'duplicate') errors.push(`relance référent ${g.ref.email} : envoi échoué`);
        continue;
      }
      sent += 1;
      const maintenant = new Date().toISOString();
      for (const l of g.membres) {
        await sb
          .schema('app')
          .from('questionnaire_assignments')
          .update({ reminders_sent: (l.reminders_sent ?? 0) + 1, last_reminder_at: maintenant } as never)
          .eq('id', l.id);
      }
    } catch (e) {
      errors.push(`relance référent : ${e instanceof Error ? e.message : 'échec'}`);
    }
  }
  return { sent, errors };
}

/**
 * Passage quotidien : relance à J+3 chaque questionnaire de satisfaction resté
 * sans réponse. Une fois par questionnaire — la clé d'unicité en fait foi.
 */
export async function runRelancesSatisfaction(sb: Client, maintenant = new Date()): Promise<{ candidates: number; sent: number; errors: string[] }> {
  // Le délai se règle par organisme (Envois automatiques) : on interroge la
  // fenêtre la plus large, puis chacun est jugé sur SON réglage.
  const bornes = REGLABLES.relance_satisfaction?.delai;
  const regles = await loadReglesParOrganisme(sb, 'relance_satisfaction');
  const depuis = new Date(maintenant.getTime() - ((bornes?.max ?? 14) + RATTRAPAGE_JOURS) * 86_400_000).toISOString();
  const jusqua = new Date(maintenant.getTime() - (bornes?.min ?? 1) * 86_400_000).toISOString();
  const { data, error } = await sb
    .schema('app')
    .from('questionnaire_assignments')
    .select('id, organization_id, status, created_at, dossier_id, template_id, recipient_kind, recipient_learner_id, recipient_name, reminders_sent, template:questionnaire_templates(kind, code)')
    .in('status', ['pending', 'in_progress'])
    .gte('created_at', depuis)
    .lte('created_at', jusqua)
    .limit(1000);
  if (error) return { candidates: 0, sent: 0, errors: [`relances satisfaction : ${error.message}`] };

  type Ligne = {
    id: string;
    organization_id: string;
    status: string;
    created_at: string;
    dossier_id: string | null;
    template_id: string;
    recipient_kind: string;
    recipient_learner_id: string | null;
    recipient_name: string | null;
    reminders_sent: number | null;
    template: { kind: string; code: string | null } | { kind: string; code: string | null }[] | null;
  };
  const aTraiter = ((data ?? []) as unknown as Ligne[]).filter((l) => {
    const t = Array.isArray(l.template) ? l.template[0] : l.template;
    const reglage = reglageEffectif('relance_satisfaction', regles.get(l.organization_id));
    return t && reglage.actif && estSatisfaction(t) && aRelancer(l, maintenant, reglage.delaiJours);
  });

  // Les stagiaires : un e-mail par référent et par questionnaire, qui les liste.
  const parStagiaire = aTraiter.filter(
    (l): l is Ligne & { dossier_id: string; recipient_learner_id: string } =>
      l.recipient_kind === 'learner' && Boolean(l.recipient_learner_id) && Boolean(l.dossier_id),
  );
  const groupes = await relancerParReferent(sb, parStagiaire);
  let sent = groupes.sent;
  const errors: string[] = [...groupes.errors];
  for (const l of aTraiter.filter((x) => !parStagiaire.includes(x as never))) {
    try {
      const r = await relancerAssignation(sb, l.id, { automatique: true, idempotencyKey: cleRelance(l.id) });
      if (r.ok) sent++;
      // Sans adresse, déjà relancé ou déjà répondu : rien d'anormal.
      else if (r.raison === 'L’e-mail n’est pas parti.') errors.push(`relance ${l.id} : envoi échoué`);
    } catch (e) {
      errors.push(`relance ${l.id} : ${e instanceof Error ? e.message : 'échec'}`);
    }
  }
  return { candidates: aTraiter.length, sent, errors };
}
