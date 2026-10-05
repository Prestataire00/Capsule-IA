import { z } from 'zod';

/** Répartition d'une séance en groupes — partagé écran ↔ action. */
export const repartitionSchema = z.object({
  sessionId: z.string().uuid(),
  groupes: z
    .array(
      z.object({
        nom: z.string().trim().min(1).max(60),
        learnerIds: z.array(z.string().uuid()).max(500),
        /** Formateur du groupe ; absent = celui de la séance. */
        trainerId: z.string().uuid().nullable().optional(),
      }),
    )
    .min(2)
    .max(10),
  appliquerSuite: z.boolean(),
  /**
   * Faux : seulement créer les groupes et y placer les stagiaires, sans toucher
   * aux séances — on rattache ensuite chaque séance à son groupe.
   */
  creerSeances: z.boolean().default(true),
});

export type RepartitionInput = z.input<typeof repartitionSchema>;
