import { z } from 'zod';

export const GenerateWithAiSchema = z.object({
  dossierId: z.string().uuid(),
  title: z.string().min(1, 'Titre requis').max(160),
  instruction: z.string().min(5, 'Décrivez le document').max(2000),
});

export const EmailDocumentSchema = z.object({
  documentId: z.string().uuid(),
  to: z.string().email('Email invalide'),
});
