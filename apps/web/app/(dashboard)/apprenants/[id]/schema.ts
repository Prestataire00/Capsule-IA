import { z } from 'zod';

export const STATUTS = ['salarie', 'dirigeant', 'independant'] as const;

export const UpdateLearnerSchema = z.object({
  learnerId: z.string().uuid(),
  firstName: z.string().trim().min(1, 'Prénom requis'),
  lastName: z.string().trim().min(1, 'Nom requis'),
  email: z.string().trim().email('Email invalide'),
  phone: z.string().trim().max(40).optional().nullable(),
  position: z.string().trim().max(120).optional().nullable(),
  statut: z.enum(STATUTS).nullable().optional(),
  rqth: z.boolean(),
  accessibilityNotes: z.string().trim().max(2000).optional().nullable(),
});

export type UpdateLearnerInput = z.infer<typeof UpdateLearnerSchema>;
