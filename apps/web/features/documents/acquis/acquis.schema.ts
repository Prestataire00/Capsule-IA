import { z } from 'zod';
import { NIVEAUX_ACQUIS } from '../acquis-objectifs';

/** Partagé par le tableau des acquis et son action. */
export const acquisSchema = z.object({
  dossierId: z.string().uuid(),
  objectif: z.string().trim().min(1).max(500),
  niveau: z.enum(NIVEAUX_ACQUIS),
  /** Un apprenant précis (0236) ; absent : le réglage de tout le dossier. */
  learnerId: z.string().uuid().optional(),
  sessionId: z.string().uuid().optional(),
});
export type AcquisInput = z.input<typeof acquisSchema>;
