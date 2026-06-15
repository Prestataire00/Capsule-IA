import { z } from 'zod';

export const uploadSupportSchema = z.object({
  moduleId: z.string().uuid(),
  title: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  storagePath: z.string().min(1),
  mimeType: z.string().min(1),
  fileSizeBytes: z.number().int().nonnegative().optional(),
});

export const togglePublishSchema = z.object({
  resourceId: z.string().uuid(),
  isPublished: z.boolean(),
});

export const deleteSupportSchema = z.object({
  resourceId: z.string().uuid(),
});
