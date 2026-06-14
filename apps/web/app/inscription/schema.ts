import { z } from 'zod';
import { FUNDER_VALUES } from '@/features/prospect/funding';

export const PROSPECT_SITUATIONS = [
  'salarie',
  'demandeur',
  'independant',
  'particulier',
] as const;

export const PROSPECT_MODALITIES = ['presentiel', 'distanciel', 'hybride', 'afest'] as const;

export const prospectFieldsSchema = z.object({
  civility: z.enum(['m', 'mme']).optional(),
  firstName: z.string().trim().min(1, 'Prénom requis').max(100),
  lastName: z.string().trim().min(1, 'Nom requis').max(100),
  email: z.string().trim().toLowerCase().email('Email invalide').max(255),
  phone: z.string().trim().max(30).optional().or(z.literal('')),
  birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date invalide').optional().or(z.literal('')),
  rqth: z.boolean(),

  formationId: z.string().uuid().optional().or(z.literal('')),
  preferredModality: z.enum(PROSPECT_MODALITIES).optional().or(z.literal('')),
  preferredStartDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date invalide').optional().or(z.literal('')),
  message: z.string().trim().max(2000).optional().or(z.literal('')),

  situation: z.enum(PROSPECT_SITUATIONS),
  companyName: z.string().trim().max(200).optional().or(z.literal('')),
  companySiret: z.string().trim().max(20).optional().or(z.literal('')),
  companyAddress: z
    .object({
      line1: z.string().trim().max(200).optional().or(z.literal('')),
      city: z.string().trim().max(120).optional().or(z.literal('')),
      postalCode: z.string().trim().max(20).optional().or(z.literal('')),
    })
    .optional(),
  referentName: z.string().trim().max(150).optional().or(z.literal('')),
  referentEmail: z.string().trim().toLowerCase().email('Email invalide').max(255).optional().or(z.literal('')),
  referentPhone: z.string().trim().max(30).optional().or(z.literal('')),
  funderKinds: z
    .array(z.enum(FUNDER_VALUES))
    .min(1, 'Sélectionnez au moins un financement'),
});

export type ProspectFields = z.infer<typeof prospectFieldsSchema>;

export const MAX_FILE_SIZE = 10 * 1024 * 1024;
export const ALLOWED_FILE_TYPES = ['application/pdf', 'image/jpeg', 'image/png'] as const;
