import 'server-only';
// Envoi d'un questionnaire coché sur une séance, à ceux qu'il vise.
//
// Un seul chemin pour le cron et pour « Envoyer maintenant » : deux copies
// auraient fini par ne pas viser les mêmes personnes.
//
// Le destinataire se lit sur le modèle (0197) :
//   · stagiaire  → chaque participant attendu, qui répond dans son espace ;
//   · entreprise → chaque entreprise cliente de la séance, par son contact ;
//   · financeur  → chaque financeur des dossiers de la séance ;
//   · formateur  → chaque formateur de la séance.
// Les trois derniers répondent par un lien signé, sans compte.

import { createHash, randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { env } from '@/env.mjs';
import { sendEmail } from '@/shared/lib/email/resend';
import { questionnaireEmail, type DestinataireQuestionnaire } from '@/shared/lib/email/questionnaire-email';
import { expediteurDeLOrganisme } from '@/shared/lib/email/expediteur-organisme';
import { generateQuestionnaireToken } from '@/shared/lib/questionnaire-token';
import { liensStagiairesReferentEmail } from '@/shared/lib/email/templates';
import { interlocuteurDuModele } from './cartographie';
import { lienStagiaire } from './lien-stagiaire';
import { referentsDesDossiers } from '@/features/espace-entreprise/referents';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Client = SupabaseClient<any, any, any>;

export type BilanEnvoi = {
  envoyes: number;
  /** Déjà destinataires de ce modèle pour ce dossier : on ne double pas. */
  deja: number;
  sansAdresse: string[];
  erreurs: string[];
};

type Cible = {
  kind: 'learner' | 'company_rep' | 'funder' | 'trainer';
  dossierId: string;
  nom: string;
  prenom: string | null;
  email: string | null;
  learnerId?: string;
  contactId?: string | null;
  funderId?: string;
  trainerId?: string;
};

const RECIPIENT: Record<Cible['kind'], string> = {
  learner: 'recipient_learner_id',
  company_rep: 'recipient_contact_id',
  funder: 'recipient_funder_id',
  trainer: 'recipient_trainer_id',
};

const DESTINATAIRE: Record<Cible['kind'], DestinataireQuestionnaire> = {
  learner: 'apprenant',
  company_rep: 'entreprise',
  funder: 'financeur',
  trainer: 'formateur',
};

const propre = (v: string | null | undefined): string | null => {
  const t = (v ?? '').trim();
  return t.includes('@') && !t.toLowerCase().endsWith('.invalid') ? t : null;
};

export function resumerBilan(b: BilanEnvoi): string {
  const parts: string[] = [];
  parts.push(`${b.envoyes} envoyé${b.envoyes > 1 ? 's' : ''}`);
  if (b.deja) parts.push(`${b.deja} déjà destinataire${b.deja > 1 ? 's' : ''}`);
  if (b.sansAdresse.length) parts.push(`sans adresse : ${b.sansAdresse.join(', ')}`);
  if (b.erreurs.length) parts.push(`${b.erreurs.length} échec${b.erreurs.length > 1 ? 's' : ''}`);
  return parts.join(' · ');
}

async function dossiersDeLaSeance(sb: Client, sessionId: string, dossierPropre: string | null) {
  const { data: links } = await sb.schema('app').from('session_dossiers').select('dossier_id').eq('session_id', sessionId);
  const ids = [
    ...new Set([dossierPropre, ...((links ?? []) as Array<{ dossier_id: string }>).map((l) => l.dossier_id)].filter((v): v is string => Boolean(v))),
  ];
  if (ids.length === 0) return [];
  const { data } = await sb
    .schema('app')
    .from('dossiers')
    .select('id, learner_id, company_id')
    .in('id', ids)
    .is('deleted_at', null);
  return (data ?? []) as Array<{ id: string; learner_id: string | null; company_id: string | null }>;
}

async function ciblesApprenants(sb: Client, sessionId: string, dossiers: Array<{ id: string; learner_id: string | null }>): Promise<Cible[]> {
  // Les participants attendus, pas tous les apprenants des dossiers : une
  // séance qui vise un groupe (0194) n'interroge que lui.
  const { data: parts } = await sb
    .schema('app')
    .from('session_participants')
    .select('learner_id')
    .eq('session_id', sessionId)
    .eq('participant_kind', 'learner');
  const attendus = new Set(((parts ?? []) as Array<{ learner_id: string | null }>).map((p) => p.learner_id).filter(Boolean));
  const dossierDe = new Map(dossiers.filter((d) => d.learner_id).map((d) => [d.learner_id as string, d.id]));
  const ids = [...attendus].filter((id): id is string => Boolean(id) && dossierDe.has(id as string));
  if (ids.length === 0) return [];
  const { data } = await sb.schema('app').from('learners').select('id, first_name, last_name, email').in('id', ids);
  return ((data ?? []) as Array<{ id: string; first_name: string; last_name: string; email: string | null }>).map((l) => ({
    kind: 'learner',
    dossierId: dossierDe.get(l.id) as string,
    nom: `${l.first_name} ${l.last_name}`.trim(),
    prenom: l.first_name,
    email: propre(l.email),
    learnerId: l.id,
  }));
}

async function ciblesEntreprises(sb: Client, dossiers: Array<{ id: string; company_id: string | null }>): Promise<Cible[]> {
  const parEntreprise = new Map<string, string>();
  for (const d of dossiers) if (d.company_id && !parEntreprise.has(d.company_id)) parEntreprise.set(d.company_id, d.id);
  const ids = [...parEntreprise.keys()];
  if (ids.length === 0) return [];
  const [{ data: companies }, { data: contacts }] = await Promise.all([
    sb.schema('app').from('companies').select('id, name, contact_name, contact_email').in('id', ids),
    sb
      .schema('app')
      .from('contacts')
      .select('id, company_id, first_name, last_name, email, created_at')
      .in('company_id', ids)
      .is('deleted_at', null)
      .not('email', 'is', null)
      .order('created_at', { ascending: true }),
  ]);
  const contactDe = new Map<string, { id: string; first_name: string | null; last_name: string | null; email: string | null }>();
  for (const c of (contacts ?? []) as Array<{ id: string; company_id: string; first_name: string | null; last_name: string | null; email: string | null }>) {
    if (!contactDe.has(c.company_id) && propre(c.email)) contactDe.set(c.company_id, c);
  }
  return ((companies ?? []) as Array<{ id: string; name: string; contact_name: string | null; contact_email: string | null }>).map((co) => {
    // Le contact nommé d'abord : c'est une personne qui répond. À défaut,
    // l'adresse de l'entreprise, plutôt que de ne rien envoyer.
    const c = contactDe.get(co.id);
    return {
      kind: 'company_rep',
      dossierId: parEntreprise.get(co.id) as string,
      nom: c ? `${c.first_name ?? ''} ${c.last_name ?? ''}`.trim() || co.name : co.contact_name || co.name,
      prenom: c?.first_name ?? null,
      email: propre(c?.email) ?? propre(co.contact_email),
      contactId: c?.id ?? null,
    };
  });
}

async function ciblesFinanceurs(sb: Client, dossiers: Array<{ id: string }>): Promise<Cible[]> {
  if (dossiers.length === 0) return [];
  const { data: liens } = await sb.schema('app').from('dossier_funders').select('dossier_id, funder_id').in('dossier_id', dossiers.map((d) => d.id));
  const parFinanceur = new Map<string, string>();
  for (const l of (liens ?? []) as Array<{ dossier_id: string; funder_id: string }>) if (!parFinanceur.has(l.funder_id)) parFinanceur.set(l.funder_id, l.dossier_id);
  const ids = [...parFinanceur.keys()];
  if (ids.length === 0) return [];
  const { data } = await sb.schema('app').from('funders').select('id, name, contact_email').in('id', ids);
  return ((data ?? []) as Array<{ id: string; name: string; contact_email: string | null }>).map((f) => ({
    kind: 'funder',
    dossierId: parFinanceur.get(f.id) as string,
    nom: f.name,
    prenom: null,
    email: propre(f.contact_email),
    funderId: f.id,
  }));
}

async function ciblesFormateurs(sb: Client, sessionId: string, dossiers: Array<{ id: string }>): Promise<Cible[]> {
  const ancre = dossiers[0]?.id;
  if (!ancre) return [];
  const { data: st } = await sb.schema('app').from('session_trainers').select('trainer_id').eq('session_id', sessionId).is('deleted_at', null);
  const ids = [...new Set(((st ?? []) as Array<{ trainer_id: string }>).map((t) => t.trainer_id))];
  if (ids.length === 0) return [];
  const { data } = await sb.schema('app').from('trainers').select('id, first_name, last_name, email').in('id', ids);
  return ((data ?? []) as Array<{ id: string; first_name: string; last_name: string; email: string | null }>).map((t) => ({
    kind: 'trainer',
    dossierId: ancre,
    nom: `${t.first_name} ${t.last_name}`.trim(),
    prenom: t.first_name,
    email: propre(t.email),
    trainerId: t.id,
  }));
}

/** Envoie le modèle à tous ceux qu'il vise sur cette séance. Idempotent par destinataire et dossier. */
export async function envoyerQuestionnaireSeance(sb: Client, args: { sessionId: string; templateId: string }): Promise<BilanEnvoi> {
  const bilan: BilanEnvoi = { envoyes: 0, deja: 0, sansAdresse: [], erreurs: [] };

  const [{ data: sRow }, { data: tRow }] = await Promise.all([
    sb.schema('app').from('sessions').select('id, organization_id, dossier_id, formation_id').eq('id', args.sessionId).maybeSingle(),
    sb.schema('app').from('questionnaire_templates').select('*').eq('id', args.templateId).is('deleted_at', null).maybeSingle(),
  ]);
  const session = sRow as { id: string; organization_id: string; dossier_id: string | null; formation_id: string | null } | null;
  const modele = tRow as { id: string; title: string; kind: string; code: string | null; audience?: string | null; organization_id: string | null } | null;
  if (!session) return { ...bilan, erreurs: ['séance introuvable'] };
  if (!modele || (modele.organization_id && modele.organization_id !== session.organization_id)) {
    return { ...bilan, erreurs: ['modèle introuvable'] };
  }

  const dossiers = await dossiersDeLaSeance(sb, session.id, session.dossier_id);
  const audience = interlocuteurDuModele(modele);
  const cibles =
    audience === 'apprenant'
      ? await ciblesApprenants(sb, session.id, dossiers)
      : audience === 'entreprise'
        ? await ciblesEntreprises(sb, dossiers)
        : audience === 'financeur'
          ? await ciblesFinanceurs(sb, dossiers)
          : await ciblesFormateurs(sb, session.id, dossiers);

  const base = env.PUBLIC_APP_URL?.trim().replace(/\/$/, '') ?? '';
  const expediteur = await expediteurDeLOrganisme(sb, session.organization_id);
  const { data: fRow } = session.formation_id
    ? await sb.schema('app').from('formations').select('title').eq('id', session.formation_id).maybeSingle()
    : { data: null };
  const formationTitle = (fRow as { title?: string } | null)?.title ?? null;

  // Les stagiaires ne reçoivent rien eux-mêmes : leurs liens partent groupés
  // à leur entreprise, qui les transmet (on n'a pas toujours leur adresse).
  const liensStagiaires = new Map<string, Array<{ nom: string; lien: string }>>();

  for (const c of cibles) {
    try {
      // Une assignation par (modèle, dossier, destinataire) : deux liens en
      // parallèle donneraient deux réponses partielles sur la même case.
      const cle = RECIPIENT[c.kind];
      const valeur = c.learnerId ?? c.contactId ?? c.funderId ?? c.trainerId ?? null;
      let existante = sb
        .schema('app')
        .from('questionnaire_assignments')
        .select('id')
        .eq('template_id', modele.id)
        .eq('dossier_id', c.dossierId)
        .eq('recipient_kind', c.kind)
        .neq('status', 'expired');
      existante = valeur ? existante.eq(cle, valeur) : existante.is(cle, null);
      const { data: dup } = await existante.limit(1).maybeSingle();
      if (dup) {
        bilan.deja++;
        continue;
      }

      const { data: creee, error } = await sb
        .schema('app')
        .from('questionnaire_assignments')
        .insert({
          organization_id: session.organization_id,
          template_id: modele.id,
          dossier_id: c.dossierId,
          session_id: session.id,
          recipient_kind: c.kind,
          [cle]: valeur,
          recipient_email: c.email,
          recipient_name: c.nom || null,
          token_hash: `pending-${randomUUID()}`,
          status: 'pending',
        } as never)
        .select('id')
        .single();
      if (error || !creee) {
        bilan.erreurs.push(`${c.nom} : ${error?.message ?? 'assignation non créée'}`);
        continue;
      }
      const assignmentId = (creee as { id: string }).id;

      // Le stagiaire répond sur une page seule, par un lien que son entreprise
      // lui transmet ; les autres reçoivent un lien signé.
      let lien: string | null = null;
      if (c.kind === 'learner') {
        if (base && c.learnerId) {
          const lienSeul = await lienStagiaire(base, 'questionnaire', {
            learnerId: c.learnerId,
            organizationId: session.organization_id,
            dossierId: c.dossierId,
            cibleId: assignmentId,
          });
          liensStagiaires.set(c.dossierId, [...(liensStagiaires.get(c.dossierId) ?? []), { nom: `${c.prenom} ${c.nom}`.trim() || c.nom, lien: lienSeul }]);
        }
        continue;
      } else {
        const signed = await generateQuestionnaireToken({ assignmentId, dossierId: c.dossierId, organizationId: session.organization_id });
        await sb
          .schema('app')
          .from('questionnaire_assignments')
          .update({ token_hash: createHash('sha256').update(signed.token).digest('hex') } as never)
          .eq('id', assignmentId);
        if (base) lien = `${base}/questionnaire/${c.kind === 'company_rep' ? 'entreprise' : 'financeur'}/${signed.token}`;
      }

      // L'assignation existe : le stagiaire la trouve dans son espace, et le
      // lien d'un tiers se relance depuis le dossier. Sans adresse, on le dit.
      if (!c.email || !lien) {
        bilan.sansAdresse.push(c.nom);
        continue;
      }
      const tpl = questionnaireEmail({
        destinataire: DESTINATAIRE[c.kind],
        prenom: c.prenom,
        titreQuestionnaire: modele.title,
        formationTitle,
        organisme: expediteur.nom,
        url: lien,
      });
      const r = await sendEmail({
        to: c.email,
        from: expediteur.from,
        subject: tpl.subject,
        html: tpl.html,
        organizationId: session.organization_id,
        dossierId: c.dossierId,
        kind: `questionnaire_${modele.kind}`,
        metadata: { session_id: session.id, template_id: modele.id, assignment_id: assignmentId },
        idempotencyKey: `questionnaire_seance:${assignmentId}`,
      });
      if (r.ok) bilan.envoyes++;
      else if (r.reason !== 'duplicate') bilan.erreurs.push(`${c.nom} : envoi échoué`);
    } catch (e) {
      bilan.erreurs.push(`${c.nom} : ${e instanceof Error ? e.message : 'échec'}`);
    }
  }

  // Un e-mail par référent, pour tous ses stagiaires.
  if (liensStagiaires.size > 0) {
    const referents = await referentsDesDossiers(sb, [...liensStagiaires.keys()]);
    const parReferent = new Map<string, { prenom: string; stagiaires: Array<{ nom: string; lien: string }> }>();
    for (const [dossierId, liste] of liensStagiaires) {
      const ref = referents.get(dossierId);
      if (!ref) {
        bilan.sansAdresse.push(...liste.map((x) => `${x.nom} (pas de référent)`));
        continue;
      }
      const entree = parReferent.get(ref.email) ?? { prenom: ref.prenom, stagiaires: [] };
      entree.stagiaires.push(...liste);
      parReferent.set(ref.email, entree);
    }
    for (const [email, { prenom, stagiaires }] of parReferent) {
      const tpl = liensStagiairesReferentEmail({
        prenom,
        objet: `« ${modele.title} » — les liens de vos stagiaires`,
        intro: `Merci de transmettre à chacun de vos stagiaires son lien vers « ${modele.title} »${formationTitle ? `, pour la formation « ${formationTitle} »` : ''}. Quelques minutes suffisent.`,
        stagiaires,
        organisme: expediteur.nom,
        libelleLien: 'son questionnaire',
      });
      const r = await sendEmail({
        to: email,
        from: expediteur.from,
        ...(expediteur.email ? { replyTo: expediteur.email } : {}),
        subject: tpl.subject,
        html: tpl.html,
        organizationId: session.organization_id,
        kind: `questionnaire_${modele.kind}`,
        metadata: { session_id: session.id, template_id: modele.id, groupe: true, stagiaires: stagiaires.length },
        idempotencyKey: `questionnaire_seance_groupe:${session.id}:${modele.id}:${email}`,
      });
      if (r.ok) bilan.envoyes += stagiaires.length;
      else if (r.reason !== 'duplicate') bilan.erreurs.push(`${email} : envoi échoué`);
    }
  }
  return bilan;
}
