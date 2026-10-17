import { z } from 'zod';
import { NIVEAUX_ACQUIS } from '../acquis-objectifs';

/** Partagé par le tableau des acquis et son action. */
export const acquisSchema = z.object({
  dossierId: z.string().uuid(),
  objectif: z.string().trim().min(1).max(500),
  niveau: z.enum(NIVEAUX_ACQUIS),
});
export type AcquisInput = z.input<typeof acquisSchema>;
