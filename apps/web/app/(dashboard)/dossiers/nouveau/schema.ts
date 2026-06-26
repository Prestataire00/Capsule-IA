import { z } from 'zod';

// Schéma partagé entre le formulaire (client) et la Server Action (cf. règle CLAUDE.md).
export const MODALITIES = ['presentiel', 'distanciel', 'hybride'] as const;
export type Modality = (typeof MODALITIES)[number];

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Un module du dossier = snapshot d'un module catalogue (module_id NOT NULL côté table).
export const DossierModuleSchema = z.object({
  moduleId: z.string().uuid(),
  title: z.string().min(1).max(200),
  durationHours: z.coerce.number().min(0).max(2000),
});
export type DossierModuleValue = z.infer<typeof DossierModuleSchema>;

// Un financement = un financeur (de type opco/cpf/… via funder.kind) + sa part HT.
// Plusieurs financements possibles par dossier ; le « reste à charge » (total − Σ parts)
// est facturé à l'entreprise/apprenant. Cf. features/billing/domain/billing-plan.ts.
export const DossierFunderSchema = z.object({
  funderId: z.string().uuid({ message: 'Financeur requis' }),
  amountCents: z.coerce.number().int().min(0).default(0),
  externalFileNumber: z.string().max(120).nullable().default(null),
});
export type DossierFunderValue = z.infer<typeof DossierFunderSchema>;

export const CreateDossierSchema = z
  .object({
    learnerId: z.string().uuid({ message: 'Apprenant requis' }),
    formationId: z.string().uuid({ message: 'Formation requise' }),
    companyId: z.string().uuid().nullable().default(null),
    modality: z.enum(MODALITIES),
    startDate: z.string().regex(DATE_RE, 'Date de début requise'),
    endDate: z.string().regex(DATE_RE, 'Date de fin requise'),
    modules: z.array(DossierModuleSchema).default([]),
    trainerId: z.string().uuid().nullable().default(null),
    totalAmountCents: z.coerce.number().int().min(0).nullable().default(null),
    funders: z.array(DossierFunderSchema).default([]),
  })
  .refine((v) => v.endDate >= v.startDate, {
    message: 'La date de fin doit être postérieure à la date de début',
    path: ['endDate'],
  })
  .refine(
    (v) => {
      const ids = v.funders.map((f) => f.funderId);
      return new Set(ids).size === ids.length;
    },
    { message: 'Un même financeur ne peut être ajouté deux fois', path: ['funders'] },
  )
  .refine(
    (v) => {
      if (v.totalAmountCents == null) return true;
      const sum = v.funders.reduce((acc, f) => acc + f.amountCents, 0);
      return sum <= v.totalAmountCents;
    },
    {
      message: 'La somme des financements dépasse le montant total HT du dossier',
      path: ['funders'],
    },
  );

export type CreateDossierValues = z.infer<typeof CreateDossierSchema>;
