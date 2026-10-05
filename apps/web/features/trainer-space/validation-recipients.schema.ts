import { z } from 'zod';

/** Désignation des validateurs et de la copie (0203) — partagé formulaire ↔ action. */
export const destinatairesSchema = z
  .object({
    validateurs: z.array(z.string().uuid()).max(20),
    copie: z.array(z.string().uuid()).max(20),
  })
  .refine((v) => !v.validateurs.some((id) => v.copie.includes(id)), {
    message: 'Une même personne ne peut pas valider et être en copie.',
  });

export type DestinatairesInput = z.infer<typeof destinatairesSchema>;
