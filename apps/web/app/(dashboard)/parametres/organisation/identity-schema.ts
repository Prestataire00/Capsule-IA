import { z } from 'zod';

const optionalText = z.string().trim().max(200).optional().or(z.literal(''));

export const OrgIdentitySchema = z.object({
  name: z.string().trim().min(1, 'Le nom commercial est requis').max(200),
  legalName: optionalText,
  siret: z.string().trim().max(14).optional().or(z.literal('')),
  declarationActivite: optionalText,
  contactEmail: z.string().trim().email('Email invalide').optional().or(z.literal('')),
  contactPhone: optionalText,
  address: z.object({
    line1: optionalText,
    postalCode: optionalText,
    city: optionalText,
  }),
  representativeName: optionalText,
  representativeTitle: optionalText,
});

export type OrgIdentityInput = z.infer<typeof OrgIdentitySchema>;
