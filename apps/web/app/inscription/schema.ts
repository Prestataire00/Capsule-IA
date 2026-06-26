import { z } from 'zod';

import { FUNDER_VALUES } from '@/features/prospect/funding';

export const PROSPECT_SITUATIONS = [
  'salarie',
  'demandeur',
  'independant',
  'particulier',
] as const;

export const PROSPECT_MODALITIES = ['presentiel', 'distanciel', 'hybride'] as const;

// Fiche besoin (analyse des besoins) saisie en ligne dans le formulaire.
export const needsAnalysisSchema = z.object({
  currentLevel: z.coerce.number().int().min(1).max(5),
  objectives: z.string().trim().min(1, 'Objectifs requis').max(2000),
  expectations: z.string().trim().max(2000).optional().or(z.literal('')),
  constraints: z.string().trim().max(2000).optional().or(z.literal('')),
  accommodations: z.string().trim().max(2000).optional().or(z.literal('')),
});
export type NeedsAnalysisFields = z.infer<typeof needsAnalysisSchema>;

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
      postalCode: z.string().trim().max(10).optional().or(z.literal('')),
    })
    .optional(),
  referentName: z.string().trim().max(200).optional().or(z.literal('')),
  referentEmail: z.string().trim().toLowerCase().email('Email invalide').max(255).optional().or(z.literal('')),
  referentPhone: z.string().trim().max(30).optional().or(z.literal('')),
  funderKinds: z.array(z.enum(FUNDER_VALUES)).min(1, 'Sélectionnez au moins un financement'),
  needsAnalysis: needsAnalysisSchema.optional(),
});

export type ProspectFields = z.infer<typeof prospectFieldsSchema>;

// ─── Inscription groupée par une entreprise (plusieurs salariés) ───────────
// Le référent saisit une fois l'entreprise + la formation + le financement,
// puis liste ses salariés. Chaque salarié → un prospect (situation 'salarie').

export const employeeSchema = z.object({
  civility: z.enum(['m', 'mme']).optional(),
  firstName: z.string().trim().min(1, 'Prénom requis').max(100),
  lastName: z.string().trim().min(1, 'Nom requis').max(100),
  email: z.string().trim().toLowerCase().email('Email invalide').max(255),
  phone: z.string().trim().max(30).optional().or(z.literal('')),
  birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date invalide').optional().or(z.literal('')),
  rqth: z.boolean(),
  needsAnalysis: needsAnalysisSchema.optional(),
});
export type EmployeeFields = z.infer<typeof employeeSchema>;

export const companyEnrollmentSchema = z.object({
  companyName: z.string().trim().min(1, 'Nom de l’entreprise requis').max(200),
  companySiret: z.string().trim().max(20).optional().or(z.literal('')),
  companyAddress: z
    .object({
      line1: z.string().trim().max(200).optional().or(z.literal('')),
      city: z.string().trim().max(120).optional().or(z.literal('')),
      postalCode: z.string().trim().max(10).optional().or(z.literal('')),
    })
    .optional(),
  companySiren: z.string().trim().regex(/^\d{9}$/, 'SIREN invalide').optional().or(z.literal('')),
  referentName: z.string().trim().max(200).optional().or(z.literal('')),
  referentEmail: z.string().trim().toLowerCase().email('Email invalide').max(255).optional().or(z.literal('')),
  referentPhone: z.string().trim().max(30).optional().or(z.literal('')),

  // Contexte entreprise (3 questions posées avant la saisie des salariés).
  companyHeadcountN1: z.number().int().min(0).max(1_000_000).optional(),
  employeesToTrain: z.number().int().min(1).max(10_000).optional(),
  trainingBudgetUsed: z.boolean().optional(),

  formationId: z.string().uuid().optional().or(z.literal('')),
  preferredModality: z.enum(PROSPECT_MODALITIES).optional().or(z.literal('')),
  preferredStartDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date invalide').optional().or(z.literal('')),
  message: z.string().trim().max(2000).optional().or(z.literal('')),

  funderKinds: z.array(z.enum(FUNDER_VALUES)).min(1, 'Sélectionnez au moins un financement'),
  employees: z.array(employeeSchema).min(1, 'Ajoutez au moins un salarié').max(100),
}).superRefine((v, ctx) => {
  // Dédoublonnage des emails de salariés (cross-field).
  const seen = new Set<string>();
  v.employees.forEach((e, i) => {
    const key = e.email.trim().toLowerCase();
    if (seen.has(key)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['employees', i, 'email'],
        message: 'Cet email est déjà utilisé pour un autre salarié.',
      });
    }
    seen.add(key);
  });
});
export type CompanyEnrollmentFields = z.infer<typeof companyEnrollmentSchema>;

export const MAX_FILE_SIZE = 10 * 1024 * 1024;
export const ALLOWED_FILE_TYPES = ['application/pdf', 'image/jpeg', 'image/png'] as const;
