import 'server-only';
import { env } from '@/env.mjs';
import { supabaseAdmin } from '@/shared/lib/supabase/admin';
import { roomCode, roomSlot } from '@/features/attendance/room-code';
import { loadSession } from '@/features/sessions/load-session';
import { ensureSatisfactionTemplate, lienSatisfaction } from './satisfaction';

/**
 * Questionnaire de satisfaction projeté en fin de séance : le formateur
 * affiche un QR, chaque stagiaire le scanne et répond sur son téléphone. Même
 * mécanique que le QR d'émargement — un code qui change toutes les dix
 * secondes prouve qu'on est dans la salle — sous un identifiant propre, pour
 * qu'un code de satisfaction ne vaille jamais pour une feuille de présence.
 */

export const cleSalleSatisfaction = (sessionId: string) => `satisfaction:${sessionId}`;

export const urlSalleSatisfaction = (base: string, sessionId: string, now: number): string =>
  `${base.replace(/\/$/, '')}/signer/satisfaction/${sessionId}?c=${roomCode(env.TOKEN_SIGNING_KEY, cleSalleSatisfaction(sessionId), roomSlot(now))}`;

export type EtatSalleSatisfaction = {
  readonly attendus: number;
  readonly repondus: number;
  readonly participants: ReadonlyArray<{ nom: string; repondu: boolean }>;
};

/** Qui a répondu, parmi les stagiaires de la séance rattachés à un dossier. */
export async function etatSalleSatisfaction(sessionId: string): Promise<EtatSalleSatisfaction | null> {
  const sb = supabaseAdmin();
  const loaded = await loadSession(sb, sessionId);
  if (!loaded) return null;
  const stagiaires = loaded.learners.filter((l) => l.dossierId);
  const templateId = await ensureSatisfactionTemplate(sb as never);
  const { data } = stagiaires.length
    ? await sb
        .schema('app')
        .from('questionnaire_assignments')
        .select('dossier_id, recipient_learner_id')
        .eq('template_id', templateId)
        .eq('status', 'completed')
        .in('dossier_id', [...new Set(stagiaires.map((l) => l.dossierId))])
    : { data: [] };
  const faits = new Set(
    ((data ?? []) as Array<{ dossier_id: string; recipient_learner_id: string | null }>).map((r) => `${r.dossier_id}:${r.recipient_learner_id}`),
  );
  const participants = stagiaires.map((l) => ({
    nom: `${l.first_name} ${l.last_name.charAt(0)}.`.trim(),
    repondu: faits.has(`${l.dossierId}:${l.id}`),
  }));
  return { attendus: participants.length, repondus: participants.filter((p) => p.repondu).length, participants };
}

/** Le lien de réponse d'un stagiaire attendu sur la séance, ou null. */
export async function lienSatisfactionEnSalle(sessionId: string, learnerId: string): Promise<string | null> {
  const loaded = await loadSession(supabaseAdmin(), sessionId);
  const stagiaire = loaded?.learners.find((l) => l.id === learnerId && l.dossierId);
  if (!loaded || !stagiaire) return null;
  return lienSatisfaction(supabaseAdmin() as never, {
    organizationId: loaded.session.organization_id,
    dossierId: stagiaire.dossierId,
    learnerId,
  });
}
