import { z } from 'zod';

export const STATUTS = ['salarie', 'dirigeant', 'independant'] as const;

export const UpdateLearnerSchema = z.object({
  learnerId: z.string().uuid(),
  firstName: z.string().trim().min(1, 'Prénom requis'),
  lastName: z.string().trim().min(1, 'Nom requis'),
  // Facultatif, comme la colonne depuis la 0176 : un stagiaire arrive souvent
  // sans adresse (liste nominative transmise plus tard, import de convention).
  // La garder obligatoire ici rendait sa fiche impossible à réenregistrer —
  // « Email invalide » sur un champ qu'on n'avait pas à remplir.
  email: z.string().trim().email('Email invalide').optional().or(z.literal('')),
  phone: z.string().trim().max(40).optional().nullable(),
  position: z.string().trim().max(120).optional().nullable(),
  statut: z.enum(STATUTS).nullable().optional(),
  rqth: z.boolean(),
  accessibilityNotes: z.string().trim().max(2000).optional().nullable(),
});

export type UpdateLearnerInput = z.infer<typeof UpdateLearnerSchema>;
