import { z } from 'zod';

export const AnonymizeLearnerSchema = z.object({
  learnerId: z.string().uuid(),
  confirmName: z.string().min(1),
});
export type AnonymizeLearnerInput = z.infer<typeof AnonymizeLearnerSchema>;

export const AnonymizeProspectSchema = z.object({
  prospectId: z.string().uuid(),
  confirmName: z.string().min(1),
});
export type AnonymizeProspectInput = z.infer<typeof AnonymizeProspectSchema>;
