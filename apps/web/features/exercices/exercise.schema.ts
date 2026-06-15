import { z } from 'zod';

export const createExerciseSchema = z.object({
  dossierId: z.string().uuid(),
  title: z.string().min(1).max(200),
  instructions: z.string().max(5000).optional(),
  moduleId: z.string().uuid().optional(),
  dueAt: z.string().datetime({ offset: true }).optional(),
  attachmentPath: z.string().optional(),
});

export const gradeSubmissionSchema = z.object({
  submissionId: z.string().uuid(),
  grade: z.number().min(0).optional(),
  feedback: z.string().max(5000).optional(),
});

export const toggleExercisePublishSchema = z.object({
  exerciseId: z.string().uuid(),
  isPublished: z.boolean(),
});

export const deleteExerciseSchema = z.object({
  exerciseId: z.string().uuid(),
});
