import { z } from 'zod';

/** Message de la discussion d'équipe d'un dossier — partagé formulaire ↔ action. */
export const messageEquipeSchema = z.object({
  dossierId: z.string().uuid(),
  body: z
    .string()
    .trim()
    .min(1, 'Écrivez votre message.')
    .max(4000, 'Message trop long (4 000 caractères au plus).')
    .refine((b) => b.includes('@'), 'Mentionnez la personne concernée avec @ : elle seule sera prévenue.'),
});

export type MessageEquipeInput = z.infer<typeof messageEquipeSchema>;
