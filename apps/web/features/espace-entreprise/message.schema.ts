import { z } from 'zod';

/** Un message de l'espace entreprise — partagé formulaire ↔ action, des deux côtés. */
export const messageEntrepriseSchema = z.object({
  body: z.string().trim().min(1, 'Écrivez votre message.').max(4000, 'Message trop long (4 000 caractères au plus).'),
  /** Le membre de l'équipe du fil direct ; absent ou null : toute l'équipe. */
  interlocuteur: z.string().uuid().nullable().optional(),
});

export type MessageEntrepriseInput = z.infer<typeof messageEntrepriseSchema>;

/** Un message qui porte un document : le texte devient facultatif. */
export const messageAvecPieceSchema = z.object({
  body: z.string().trim().max(4000, 'Message trop long (4 000 caractères au plus).'),
  interlocuteur: z.string().uuid().nullable().optional(),
});
