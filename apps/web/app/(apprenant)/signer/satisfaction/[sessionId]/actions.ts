'use server';

import { cookies } from 'next/headers';
import { env } from '@/env.mjs';
import { checkRoomPass, learnerCookie, LEARNER_COOKIE_MS } from '@/features/attendance/room-code';
import { LEARNER_COOKIE, findExpectedLearnerByName } from '@/features/attendance/room';
import { cleSalleSatisfaction, lienSatisfactionEnSalle } from '@/features/questionnaire/satisfaction-salle';
import { cleSalleQuestionnaire, lienQuestionnaireEnSalle } from '@/features/questionnaire/questionnaire-salle';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Identification après un scan valide (laissez-passer de dix minutes) : le
 * nom d'un stagiaire attendu sur la séance. Le téléphone le retient, comme à
 * l'émargement, pour les scans suivants.
 */
export async function identifierPourSatisfaction(input: {
  sessionId: string;
  pass: string;
  prenom: string;
  nom: string;
  /** Un questionnaire de la séance projeté ; absent : la satisfaction à chaud. */
  templateId?: string;
}): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const prenom = input?.prenom?.trim() ?? '';
  const nom = input?.nom?.trim() ?? '';
  if (!UUID.test(input?.sessionId ?? '') || !prenom || !nom || prenom.length > 120 || nom.length > 120) {
    return { ok: false, error: 'Indiquez votre prénom et votre nom.' };
  }
  const templateId = input.templateId && UUID.test(input.templateId) ? input.templateId : null;
  const cle = templateId ? cleSalleQuestionnaire(input.sessionId, templateId) : cleSalleSatisfaction(input.sessionId);
  if (!checkRoomPass(env.TOKEN_SIGNING_KEY, cle, input.pass, Date.now())) {
    return { ok: false, error: 'Le délai est dépassé : scannez à nouveau le QR code affiché.' };
  }
  const trouve = await findExpectedLearnerByName(input.sessionId, { prenom, nom });
  if (!trouve.ok) {
    return {
      ok: false,
      error:
        trouve.error === 'room_name_ambiguous'
          ? 'Deux stagiaires portent ce nom : demandez au formateur.'
          : 'Ce nom ne figure pas parmi les stagiaires de la séance. Vérifiez l’orthographe, ou demandez au formateur.',
    };
  }
  const url = templateId
    ? await lienQuestionnaireEnSalle(input.sessionId, templateId, trouve.learnerId)
    : await lienSatisfactionEnSalle(input.sessionId, trouve.learnerId);
  if (!url) return { ok: false, error: 'Votre questionnaire n’est pas disponible : demandez au formateur.' };

  cookies().set(LEARNER_COOKIE, learnerCookie(env.TOKEN_SIGNING_KEY, trouve.learnerId, Date.now()), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/signer',
    maxAge: Math.floor(LEARNER_COOKIE_MS / 1000),
  });
  return { ok: true, url };
}
