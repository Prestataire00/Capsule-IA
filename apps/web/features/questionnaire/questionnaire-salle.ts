import 'server-only';
import { createHash, randomBytes } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { env } from '@/env.mjs';
import { supabaseAdmin } from '@/shared/lib/supabase/admin';
import { roomCode, roomSlot } from '@/features/attendance/room-code';
import { stagiairesDeLaSeance } from './stagiaires-de-seance';
import { generateNeedsAnalysisToken } from '@/shared/lib/needs-analysis-token';
import { lienStagiaire } from './lien-stagiaire';
import { interlocuteurDuModele } from './cartographie';

/**
 * N'importe quel questionnaire de la séance, projeté en salle (demande
 * d'Ismael, 2026-10-07) : la mécanique du QR de satisfaction — un code qui
 * change toutes les dix secondes, le stagiaire donne son nom, il répond sur
 * son téléphone — pour le modèle choisi, sous une clé qui lui est propre.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const admin = () => supabaseAdmin() as unknown as SupabaseClient<any, any, any>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const cleSalleQuestionnaire = (sessionId: string, templateId: string) => `questionnaire:${sessionId}:${templateId}`;

export const urlSalleQuestionnaire = (base: string, sessionId: string, templateId: string, now: number): string =>
  `${base.replace(/\/$/, '')}/signer/questionnaire/${sessionId}/${templateId}?c=${roomCode(env.TOKEN_SIGNING_KEY, cleSalleQuestionnaire(sessionId, templateId), roomSlot(now))}`;

type Modele = { id: string; title: string; kind: string; code: string | null; audience: string | null; organization_id: string | null };

/** Le modèle, s'il s'adresse aux stagiaires et appartient à l'organisme de la séance. */
export async function modeleProjetable(sessionId: string, templateId: string): Promise<{ modele: Modele; organizationId: string } | null> {
  if (!UUID.test(sessionId) || !UUID.test(templateId)) return null;
  const sb = admin();
  const [{ data: s }, { data: t }] = await Promise.all([
    sb.schema('app').from('sessions').select('organization_id').eq('id', sessionId).maybeSingle(),
    sb.schema('app').from('questionnaire_templates').select('id, title, kind, code, audience, organization_id').eq('id', templateId).is('deleted_at', null).maybeSingle(),
  ]);
  const seance = s as { organization_id: string } | null;
  const modele = t as unknown as Modele | null;
  if (!seance || !modele) return null;
  if (modele.organization_id && modele.organization_id !== seance.organization_id) return null;
  if (interlocuteurDuModele(modele) !== 'apprenant') return null;
  return { modele, organizationId: seance.organization_id };
}

export type EtatSalleQuestionnaire = {
  readonly titre: string;
  readonly attendus: number;
  readonly repondus: number;
  readonly participants: ReadonlyArray<{ nom: string; repondu: boolean }>;
};

/** Qui a répondu à ce questionnaire, parmi les stagiaires de la séance rattachés à un dossier. */
export async function etatSalleQuestionnaire(sessionId: string, templateId: string): Promise<EtatSalleQuestionnaire | null> {
  const projetable = await modeleProjetable(sessionId, templateId);
  if (!projetable) return null;
  const sb = admin();
  const stagiaires = await stagiairesDeLaSeance(sb as never, sessionId);
  const { data } = stagiaires.length
    ? await sb
        .schema('app')
        .from('questionnaire_assignments')
        .select('dossier_id, session_id, recipient_learner_id')
        .eq('template_id', templateId)
        .eq('status', 'completed')
        .in('recipient_learner_id', stagiaires.map((l) => l.id))
    : { data: [] };
  // Avec dossier : sa réponse sur ce dossier ; sans dossier : sa réponse sur cette séance.
  const faits = new Set(
    ((data ?? []) as Array<{ dossier_id: string | null; session_id: string | null; recipient_learner_id: string | null }>).map((r) =>
      r.dossier_id ? `${r.dossier_id}:${r.recipient_learner_id}` : `seance:${r.session_id}:${r.recipient_learner_id}`,
    ),
  );
  const participants = stagiaires.map((l) => ({
    nom: `${l.prenom} ${l.nom.charAt(0)}.`.trim(),
    repondu: faits.has(l.dossierId ? `${l.dossierId}:${l.id}` : `seance:${sessionId}:${l.id}`),
  }));
  return { titre: projetable.modele.title, attendus: participants.length, repondus: participants.filter((p) => p.repondu).length, participants };
}

/**
 * Le lien de réponse d'un stagiaire attendu sur la séance : son assignation
 * pour ce modèle (reprise si elle existe déjà, même envoyée par e-mail), puis
 * sa page de réponse.
 */
export async function lienQuestionnaireEnSalle(sessionId: string, templateId: string, learnerId: string): Promise<string | null> {
  const base = env.PUBLIC_APP_URL?.trim().replace(/\/$/, '');
  const projetable = await modeleProjetable(sessionId, templateId);
  if (!base || !projetable) return null;
  const sb = admin();
  const stagiaire = (await stagiairesDeLaSeance(sb as never, sessionId)).find((l) => l.id === learnerId);
  if (!stagiaire) return null;

  let recherche = sb
    .schema('app')
    .from('questionnaire_assignments')
    .select('id')
    .eq('template_id', templateId)
    .eq('recipient_kind', 'learner')
    .eq('recipient_learner_id', learnerId)
    .neq('status', 'expired');
  recherche = stagiaire.dossierId ? recherche.eq('dossier_id', stagiaire.dossierId) : recherche.is('dossier_id', null).eq('session_id', sessionId);
  const { data: existante } = await recherche.order('created_at', { ascending: true }).limit(1).maybeSingle();
  let assignmentId = (existante as { id: string } | null)?.id ?? null;
  if (!assignmentId) {
    const { data: creee, error } = await sb
      .schema('app')
      .from('questionnaire_assignments')
      .insert({
        organization_id: projetable.organizationId,
        template_id: templateId,
        dossier_id: stagiaire.dossierId,
        session_id: sessionId,
        recipient_kind: 'learner',
        recipient_learner_id: learnerId,
        recipient_name: `${stagiaire.prenom} ${stagiaire.nom}`.trim() || null,
        token_hash: createHash('sha256').update(randomBytes(24)).digest('hex'),
        status: 'pending',
      } as never)
      .select('id')
      .single();
    if (error || !creee) {
      console.error('[questionnaire en salle] assignation non créée', error?.message);
      return null;
    }
    assignmentId = (creee as { id: string }).id;
  }
  if (!stagiaire.dossierId) {
    // Inscrit sur la séance seule : le lien direct, sans espace stagiaire.
    const { token } = await generateNeedsAnalysisToken({ assignmentId, dossierId: null, organizationId: projetable.organizationId, learnerId });
    return `${base}/questionnaire/besoin/${token}`;
  }
  return lienStagiaire(base, 'questionnaire', {
    learnerId,
    organizationId: projetable.organizationId,
    dossierId: stagiaire.dossierId,
    cibleId: assignmentId,
  });
}

/** Les questionnaires stagiaires prévus pour la séance (cochés ou déjà envoyés), à projeter. */
export async function questionnairesProjetables(sessionId: string): Promise<Array<{ id: string; titre: string }>> {
  if (!UUID.test(sessionId)) return [];
  const sb = admin();
  const { data: p } = await sb.schema('app').from('session_questionnaires').select('template_id, enabled, sent_at').eq('session_id', sessionId);
  const ids = ((p ?? []) as Array<{ template_id: string; enabled: boolean; sent_at: string | null }>).filter((x) => x.enabled || x.sent_at).map((x) => x.template_id);
  if (ids.length === 0) return [];
  const { data: t } = await sb.schema('app').from('questionnaire_templates').select('id, title, kind, code, audience').in('id', ids).is('deleted_at', null);
  return ((t ?? []) as Array<{ id: string; title: string; kind: string; code: string | null; audience: string | null }>)
    .filter((m) => interlocuteurDuModele(m) === 'apprenant')
    .map((m) => ({ id: m.id, titre: m.title }))
    .sort((a, b) => a.titre.localeCompare(b.titre, 'fr'));
}
