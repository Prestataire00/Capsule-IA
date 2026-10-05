import { z } from 'zod';
import { COULEURS } from './annotations';

/** Nouvelle annotation — partagé formulaire ↔ action. */
export const annotationSchema = z.object({
  targetKind: z.enum(['support', 'cours']),
  targetId: z.string().uuid(),
  questionId: z.string().trim().max(100).optional(),
  extrait: z.string().trim().max(500).optional(),
  couleur: z.enum(COULEURS),
  commentaire: z.string().trim().min(1, 'Écrivez ce qui ne va pas, ou ce qui va bien.').max(2000),
});

export type AnnotationInput = z.infer<typeof annotationSchema>;
