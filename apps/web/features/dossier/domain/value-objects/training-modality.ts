export const TrainingModalityValues = [
  'presentiel',
  'distanciel',
  'hybride',
] as const;

export type TrainingModality = (typeof TrainingModalityValues)[number];

export const isTrainingModality = (s: string): s is TrainingModality =>
  (TrainingModalityValues as readonly string[]).includes(s);
