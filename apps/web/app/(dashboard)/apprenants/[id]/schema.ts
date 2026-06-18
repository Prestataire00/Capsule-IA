import { z } from 'zod';

const STATUTS = ['salarie', 'dirigeant', 'independant'] as const;

export const UpdateLearnerSchema = z.object({
  learnerId: z.string().uuid(),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  email: z.string().email(),
  phone: z.string().nullable(),
  position: z.string().nullable(),
  statut: z.enum(STATUTS).nullable(),
  rqth: z.boolean(),
  accessibilityNotes: z.string().nullable(),
});

export type UpdateLearnerInput = z.infer<typeof UpdateLearnerSchema>;
