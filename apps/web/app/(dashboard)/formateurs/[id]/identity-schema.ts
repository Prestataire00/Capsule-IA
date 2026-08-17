import { z } from 'zod';

/**
 * Schéma d'édition d'une fiche formateur. Hors du module `'use server'` : un
 * module de Server Actions ne peut exporter que des fonctions asynchrones —
 * toute autre valeur exportée fait échouer le rendu de la page qui l'importe.
 */
const optional = (max: number) => z.string().trim().max(max).optional().or(z.literal(''));

export const TrainerIdentitySchema = z.object({
  firstName: z.string().trim().min(1, 'Le prénom est requis').max(100),
  lastName: z.string().trim().min(1, 'Le nom est requis').max(100),
  email: z.string().trim().email('E-mail invalide').max(255),
  phone: optional(30),
  isInternal: z.boolean(),
  siret: z
    .string()
    .trim()
    .transform((v) => v.replace(/\s+/g, ''))
    .refine((v) => v === '' || /^\d{14}$/.test(v), 'SIRET : 14 chiffres')
    .optional()
    .or(z.literal('')),
  nda: optional(50),
  zoomUrl: optional(500),
  specialties: z.array(z.string().trim().max(60)).max(12),
});

export type TrainerIdentityInput = z.infer<typeof TrainerIdentitySchema>;
