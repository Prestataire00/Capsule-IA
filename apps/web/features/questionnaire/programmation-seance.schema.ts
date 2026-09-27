// ARCHETYPE: shared
// Schémas partagés entre l'onglet Questionnaires d'une séance et ses Server Actions.
import { z } from 'zod';
import { lireCleMoment } from './programmation-seance';

export const programmerQuestionnaireSchema = z.object({
  sessionId: z.string().uuid(),
  templateId: z.string().uuid(),
  coche: z.boolean(),
  /** « debut:-7 », « fin:1 »… */
  moment: z.string().refine((v) => lireCleMoment(v) !== null, 'Moment inconnu'),
});

export const envoyerQuestionnaireSchema = programmerQuestionnaireSchema.pick({ sessionId: true, templateId: true, moment: true });

export type ProgrammerQuestionnaireInput = z.input<typeof programmerQuestionnaireSchema>;
export type EnvoyerQuestionnaireInput = z.input<typeof envoyerQuestionnaireSchema>;
