import { z } from 'zod';
import { FUNDER_VALUES } from '@/features/prospect/funding';
import { PROSPECT_MODALITIES, PROSPECT_SITUATIONS } from '@/app/inscription/schema';

// Demande enregistrée par l'organisme (au téléphone, par mail, en direct).
// La formation est FACULTATIVE : soit une formation du catalogue, soit un
// intitulé libre pour un besoin spécifique, soit rien du tout pour l'instant.
export const NouvelleDemandeSchema = z
  .object({
    civility: z.enum(['m', 'mme']).optional().or(z.literal('')),
    firstName: z.string().trim().min(1, 'Prénom requis').max(100),
    lastName: z.string().trim().min(1, 'Nom requis').max(100),
    email: z.string().trim().toLowerCase().email('E-mail invalide').max(255),
    phone: z.string().trim().max(30).optional().or(z.literal('')),
    birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date invalide').optional().or(z.literal('')),
    rqth: z.boolean().default(false),

    situation: z.enum(PROSPECT_SITUATIONS),
    funderKind: z.enum(FUNDER_VALUES),
    companyName: z.string().trim().max(200).optional().or(z.literal('')),
    companySiret: z.string().trim().max(20).optional().or(z.literal('')),
    conventionCollective: z.string().trim().max(200).optional().or(z.literal('')),
    referentName: z.string().trim().max(160).optional().or(z.literal('')),
    referentEmail: z.string().trim().email('E-mail du référent invalide').optional().or(z.literal('')),
    referentPhone: z.string().trim().max(30).optional().or(z.literal('')),

    /** Formation du catalogue ; vide = besoin spécifique ou formation à définir. */
    formationId: z.string().uuid().optional().or(z.literal('')),
    customFormationTitle: z.string().trim().max(200).optional().or(z.literal('')),
    customFormationHours: z.number().positive().max(2000).nullable().default(null),
    customFormationPriceCents: z.number().int().min(0).max(100_000_000).nullable().default(null),

    preferredModality: z.enum(PROSPECT_MODALITIES).optional().or(z.literal('')),
    preferredStartDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date invalide').optional().or(z.literal('')),
    message: z.string().trim().max(2000).optional().or(z.literal('')),

    /** Crée aussitôt le dossier (et son devis dès que la session sera planifiée). */
    convertNow: z.boolean().default(false),
  })
  .superRefine((v, ctx) => {
    // Une demande peut rester sans formation ; mais on ne peut pas ouvrir le
    // dossier tout de suite sans savoir sur quoi il porte.
    if (v.convertNow && !v.formationId && !v.customFormationTitle) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['customFormationTitle'],
        message: 'Pour créer le dossier tout de suite, indiquez une formation (catalogue ou intitulé libre).',
      });
    }
  });

export type NouvelleDemandeValues = z.input<typeof NouvelleDemandeSchema>;
