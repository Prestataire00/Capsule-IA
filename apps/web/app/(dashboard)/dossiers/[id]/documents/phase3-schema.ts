import { z } from 'zod';
import { TEMPLATE_KINDS } from '@/app/(dashboard)/documents/modeles/schema';

export const GenerateWithAiSchema = z.object({
  dossierId: z.string().uuid(),
  kind: z.enum(TEMPLATE_KINDS).default('autre'),
  // Titre optionnel : à défaut, on reprend le libellé du type de document.
  title: z.string().max(160).optional().default(''),
  instruction: z.string().min(5, 'Décrivez le document').max(2000),
});

export const EmailDocumentSchema = z.object({
  documentId: z.string().uuid(),
  to: z.string().email('Email invalide'),
});
