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

/** Message d'une conversation directe : on parle à des personnes, sans mention à poser. */
export const messageDirectSchema = z.object({
  conversationId: z.string().uuid(),
  body: z.string().trim().min(1, 'Écrivez votre message.').max(4000, 'Message trop long (4 000 caractères au plus).'),
});

export type MessageDirectInput = z.infer<typeof messageDirectSchema>;

/** Les personnes avec qui ouvrir une conversation directe. */
export const nouvelleConversationSchema = z.object({
  avec: z
    .array(z.string().uuid())
    .min(1, 'Choisissez au moins une personne.')
    .max(12, 'Douze personnes au plus dans une conversation.'),
});

export type NouvelleConversationInput = z.infer<typeof nouvelleConversationSchema>;
