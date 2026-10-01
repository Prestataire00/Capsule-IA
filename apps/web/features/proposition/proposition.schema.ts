// ARCHETYPE: shared
// Schémas partagés entre l'écran des propositions et ses Server Actions.
import { z } from 'zod';
import { programmeExtraitSchema } from '@/features/formations/programme/programme-extrait';

export const reviserSchema = z.object({
  prospectId: z.string().uuid(),
  propositionId: z.string().uuid(),
  consignes: z.string().trim().min(5, 'Dites à l’IA ce qu’il faut changer.').max(4000, '4 000 caractères au plus.'),
});

export const envoyerSchema = z.object({ prospectId: z.string().uuid(), propositionId: z.string().uuid() });

/** Le nom sert au titre et à reconnaître le format : aucun format ni taille imposés. */
export const depotSchema = z.object({ prospectId: z.string().uuid(), nom: z.string().trim().min(1).max(300) });

export const deposeSchema = depotSchema.extend({
  path: z.string().min(1).max(500),
  /** Programme lu par l'IA à la création de la demande, repris sur la formation à la conversion. */
  extrait: programmeExtraitSchema.optional(),
});
