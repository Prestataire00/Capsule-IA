import { z } from 'zod';

/** Profil de facturation du formateur : partagé entre le formulaire et l'action serveur. */

const facultatif = (max: number) => z.string().trim().max(max).optional().or(z.literal(''));

export const billingProfileSchema = z.object({
  legalName: z.string().trim().min(2, 'Nom ou raison sociale requis').max(200),
  addressLine: z.string().trim().min(3, 'Adresse requise').max(300),
  postalCode: z.string().trim().regex(/^[0-9A-Za-z -]{3,10}$/, 'Code postal invalide'),
  city: z.string().trim().min(1, 'Ville requise').max(120),
  siret: z
    .string()
    .transform((v) => v.replace(/\s+/g, ''))
    .refine((v) => /^\d{14}$/.test(v), 'SIRET : 14 chiffres'),
  vatRegime: z.enum(['franchise', 'assujetti']),
  vatRate: z.coerce.number().min(0, 'Taux invalide').max(30, 'Taux invalide'),
  vatNumber: facultatif(30),
  iban: z
    .string()
    .transform((v) => v.replace(/\s+/g, '').toUpperCase())
    .refine((v) => v === '' || /^[A-Z]{2}[0-9A-Z]{13,32}$/.test(v), 'IBAN invalide'),
  bic: z
    .string()
    .transform((v) => v.replace(/\s+/g, '').toUpperCase())
    .refine((v) => v === '' || /^[A-Z0-9]{8}([A-Z0-9]{3})?$/.test(v), 'BIC invalide'),
  invoicePrefix: z
    .string()
    .transform((v) => v.trim().toUpperCase())
    .refine((v) => /^[A-Z0-9-]{1,10}$/.test(v), 'Préfixe : lettres, chiffres ou tiret, 10 au plus'),
  nextInvoiceNumber: z.coerce.number().int().min(1, 'Numéro invalide').max(999999, 'Numéro invalide'),
});

export type BillingProfileInput = z.input<typeof billingProfileSchema>;
