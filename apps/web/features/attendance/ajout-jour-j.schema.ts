import { z } from 'zod';

/** Stagiaire ajouté le jour J depuis l'émargement — partagé formulaire ↔ action. */
export const ajoutJourJSchema = z.object({
  sessionId: z.string().uuid(),
  prenom: z.string().trim().min(1, 'Indiquez le prénom.').max(100),
  nom: z.string().trim().min(1, 'Indiquez le nom.').max(100),
  email: z.union([z.literal(''), z.string().trim().email('Adresse e-mail invalide.').max(200)]).optional(),
});

export type AjoutJourJ = z.infer<typeof ajoutJourJSchema>;
