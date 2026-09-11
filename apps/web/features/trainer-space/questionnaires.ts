/** Questionnaires côté formateur : ce qu'il peut envoyer, et ce qui reste anonyme. */

export const TRAINER_SENDABLE_KINDS = ['positionnement', 'evaluation_acquis', 'satisfaction_chaud', 'satisfaction_froid', 'custom'] as const;

export const KIND_LABELS: Record<string, string> = {
  positionnement: 'Positionnement',
  evaluation_acquis: 'Évaluation des acquis',
  satisfaction_chaud: 'Satisfaction à chaud',
  satisfaction_froid: 'Satisfaction à froid',
  satisfaction_formateur: 'Évaluation du formateur',
  custom: 'Personnalisé',
};

/** Réponses annoncées anonymes aux apprenants : jamais montrées une à une au formateur. */
export const isSatisfactionKind = (kind: string) =>
  kind === 'satisfaction_chaud' || kind === 'satisfaction_froid' || kind === 'satisfaction_formateur';

export const STATUS_LABELS: Record<string, string> = {
  pending: 'envoyé',
  in_progress: 'commencé',
  completed: 'répondu',
  expired: 'expiré',
};
