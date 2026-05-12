import { z } from 'zod';

export const TrainerProfilePatchSchema = z.object({
  firstName: z.string().trim().min(1, 'Prénom requis').max(100).optional(),
  lastName: z.string().trim().min(1, 'Nom requis').max(100).optional(),
  phone: z.string().trim().max(30).nullable().optional(),
  bio: z.string().trim().max(2000).nullable().optional(),
  specialties: z.array(z.string().trim().min(1).max(50)).max(12).optional(),
  avatarPath: z.string().nullable().optional(),
});

export const UpdateProfileSchema = z.object({
  trainerIds: z.array(z.string().uuid()).min(1).max(10),
  patch: TrainerProfilePatchSchema,
});

export const CompetencyKindSchema = z.enum(['diploma', 'certification', 'experience', 'cv']);

export const AddCompetencySchema = z.object({
  trainerId: z.string().uuid(),
  organizationId: z.string().uuid(),
  kind: CompetencyKindSchema,
  title: z.string().trim().min(1).max(200),
  issuer: z.string().trim().max(200).nullable().optional(),
  obtainedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  expiresAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
});

export const RemoveCompetencySchema = z.object({
  competencyId: z.string().uuid(),
});

export const DuplicateCompetencySchema = z.object({
  sourceCompetencyId: z.string().uuid(),
  targetOrganizationIds: z.array(z.string().uuid()).min(1).max(10),
});
