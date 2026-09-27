// ARCHETYPE: shared
// Quels questionnaires de satisfaction relancer, et quand. Module pur.
//
// Demande d'Ismael le 27/09/2026 : chaque questionnaire de satisfaction envoyé
// est relancé à J+3 s'il est resté sans réponse, et le rappel dit qu'il ne va
// qu'à ceux qui n'ont pas encore répondu. Un taux de réponse Qualiopi se
// construit à la relance, pas au premier envoi.

/** Le défaut ; chaque organisme le règle dans « Envois automatiques ». */
export const DELAI_RELANCE_JOURS = 3;
/**
 * Passé le délai d'une semaine, on ne relance plus : un questionnaire vieux
 * d'un mois relancé le jour où la règle apparaît ferait partir d'un coup tout
 * l'arriéré.
 */
export const RATTRAPAGE_JOURS = 7;

const JOUR = 86_400_000;

/** Un questionnaire de satisfaction, quel que soit son destinataire. */
export function estSatisfaction(modele: { kind: string; code?: string | null }): boolean {
  return (
    modele.kind === 'satisfaction_chaud' ||
    modele.kind === 'satisfaction_froid' ||
    modele.kind === 'satisfaction_formateur' ||
    (modele.code ?? '').startsWith('satisfaction_entreprise')
  );
}

/** À relancer maintenant : sans réponse, envoyé depuis le délai, pas depuis trop longtemps. */
export function aRelancer(a: { status: string; created_at: string }, maintenant: Date, delaiJours = DELAI_RELANCE_JOURS): boolean {
  if (a.status === 'completed' || a.status === 'expired') return false;
  const age = maintenant.getTime() - new Date(a.created_at).getTime();
  return age >= delaiJours * JOUR && age < (delaiJours + RATTRAPAGE_JOURS) * JOUR;
}

/** Clé d'unicité : une seule relance automatique par questionnaire. */
export const cleRelance = (assignmentId: string) => `relance_satisfaction_j3:${assignmentId}`;
