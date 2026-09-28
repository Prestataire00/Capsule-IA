// ARCHETYPE: shared
// Schémas partagés entre l'écran des propositions et ses Server Actions.
import { z } from 'zod';

export const reviserSchema = z.object({
  prospectId: z.string().uuid(),
  propositionId: z.string().uuid(),
  consignes: z.string().trim().min(5, 'Dites à l’IA ce qu’il faut changer.').max(4000, '4 000 caractères au plus.'),
});

export const envoyerSchema = z.object({ prospectId: z.string().uuid(), propositionId: z.string().uuid() });
