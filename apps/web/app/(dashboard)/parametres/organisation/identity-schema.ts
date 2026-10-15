import { z } from 'zod';
import { bicValide, ibanValide, normaliserBancaire } from '@/shared/lib/iban';

const optionalText = z.string().trim().max(200).optional().or(z.literal(''));

export const OrgIdentitySchema = z.object({
  name: z.string().trim().min(1, 'Le nom commercial est requis').max(200),
  legalName: optionalText,
  // Tolère les espaces (ex. « 989 531 116 00014 ») : on les retire, un SIRET
  // fait 14 chiffres → on valide sur la valeur nettoyée.
  siret: z
    .string()
    .trim()
    .transform((v) => v.replace(/\s+/g, ''))
    .refine((v) => v.length <= 14, 'SIRET : 14 chiffres maximum')
    .optional()
    .or(z.literal('')),
  declarationActivite: optionalText,
  /** Agréments affichés sur les documents (CNAPS, habilitations…). */
  certifications: z.string().trim().max(300).optional().or(z.literal('')),
  contactEmail: z.string().trim().email('Email invalide').optional().or(z.literal('')),
  contactPhone: optionalText,
  address: z.object({
    line1: optionalText,
    postalCode: optionalText,
    city: optionalText,
  }),
  representativeName: optionalText,
  representativeTitle: optionalText,
  // Régime de TVA : la plupart des organismes de formation sont exonérés
  // (art. 261-4-4°a CGI). Le taux ne s'applique que si l'organisme est assujetti.
  vatRegime: z.enum(['exempt', 'subject']),
  defaultVatRate: z.coerce.number().min(0).max(100),
  // Option pour les débits : la TVA devient exigible à la facturation, et non à
  // l'encaissement. Quand elle est prise, la mention doit figurer sur chaque
  // facture — c'est l'une des quatre mentions de la facturation électronique.
  vatOnDebits: z.coerce.boolean().optional().default(false),
  // Imprimées sur chaque facture, pour le règlement par virement.
  bankIban: z
    .string()
    .transform(normaliserBancaire)
    .refine((v) => v === '' || ibanValide(v), 'IBAN invalide')
    .optional()
    .default(''),
  bankBic: z
    .string()
    .transform(normaliserBancaire)
    .refine((v) => v === '' || bicValide(v), 'BIC invalide')
    .optional()
    .default(''),
  bankName: z.string().trim().max(120).optional().or(z.literal('')),
});

export type OrgIdentityInput = z.infer<typeof OrgIdentitySchema>;
