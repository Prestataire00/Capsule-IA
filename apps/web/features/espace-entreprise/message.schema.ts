import { z } from 'zod';

/** Un message de l'espace entreprise — partagé formulaire ↔ action, des deux côtés. */
export const messageEntrepriseSchema = z.object({
  body: z.string().trim().min(1, 'Écrivez votre message.').max(4000, 'Message trop long (4 000 caractères au plus).'),
});

export type MessageEntrepriseInput = z.infer<typeof messageEntrepriseSchema>;
