/**
 * Où en est chaque stagiaire d'une séance : émargement, fiche de
 * positionnement, évaluations. Module pur — le chargeur lit, ceci décide.
 */

export const QUESTIONNAIRES_SUIVIS = ['positionnement', 'evaluation_acquis', 'satisfaction_chaud', 'satisfaction_froid'] as const;
export type QuestionnaireSuivi = (typeof QUESTIONNAIRES_SUIVIS)[number];

export const QUESTIONNAIRE_LABELS: Record<QuestionnaireSuivi, string> = {
  positionnement: 'Positionnement',
  evaluation_acquis: 'Acquis',
  satisfaction_chaud: 'Satisfaction à chaud',
  satisfaction_froid: 'Satisfaction à froid',
};

export type EtatQuestionnaire = 'rempli' | 'envoye' | 'aucun';

/** Rempli dès qu'une réponse existe ; envoyé tant qu'une fiche attend. */
export function etatQuestionnaire(
  assignations: ReadonlyArray<{ kind: string; status: string }>,
  kind: QuestionnaireSuivi,
): EtatQuestionnaire {
  const duType = assignations.filter((a) => a.kind === kind && a.status !== 'expired');
  if (duType.some((a) => a.status === 'completed')) return 'rempli';
  return duType.length > 0 ? 'envoye' : 'aucun';
}

export type EtatEmargement = {
  /** Demi-journées déjà commencées où il est attendu. */
  readonly attendues: number;
  /** Parmi elles, celles où sa présence est signée ou attestée. */
  readonly signees: number;
};

/** Seules comptent les demi-journées déjà ouvertes : on ne signe pas l'avenir. */
export function etatEmargement(
  feuilles: ReadonlyArray<{
    windowStart: string;
    participants: ReadonlyArray<{ id: string; kind: string; expected: boolean; entryAt: string | null; attestedAt: string | null }>;
  }>,
  learnerId: string,
  maintenant: number,
): EtatEmargement {
  let attendues = 0;
  let signees = 0;
  for (const f of feuilles) {
    if (new Date(f.windowStart).getTime() > maintenant) continue;
    const p = f.participants.find((x) => x.kind === 'learner' && x.id === learnerId && x.expected);
    if (!p) continue;
    attendues += 1;
    if (p.entryAt || p.attestedAt) signees += 1;
  }
  return { attendues, signees };
}
