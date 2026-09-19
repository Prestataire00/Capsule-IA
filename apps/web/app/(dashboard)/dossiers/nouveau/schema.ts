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

/** Pour qui l'on ouvre le dossier : une personne, ou une entreprise cliente. */
export const CLIENT_KINDS = ['individual', 'company'] as const;
export type ClientKind = (typeof CLIENT_KINDS)[number];

/** Formation montée pour ce client, absente du catalogue. */
export const CustomFormationSchema = z.object({
  title: z.string().trim().min(1, 'Intitulé requis').max(200),
  durationHours: z.coerce.number().min(0.5, 'Durée requise').max(2000),
  priceCents: z.coerce.number().int().min(0).default(0),
});
export type CustomFormationValue = z.infer<typeof CustomFormationSchema>;

export const CreateDossierSchema = z
  .object({
    clientKind: z.enum(CLIENT_KINDS).default('individual'),
    // Une commande d'entreprise s'ouvre avant que les noms soient connus :
    // le titulaire n'est donc pas exigé ici (un provisoire est posé, 0175).
    learnerId: z.string().uuid().nullable().default(null),
    /** Stagiaires nommés dès la création — facultatif. */
    learnerIds: z.array(z.string().uuid()).max(200).default([]),
    formationId: z.string().uuid().nullable().default(null),
    /** Renseignée à la place de `formationId` pour une formation sur mesure. */
    customFormation: CustomFormationSchema.nullable().default(null),
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
  .refine((v) => Boolean(v.formationId) || Boolean(v.customFormation), {
    message: 'Choisissez une formation du catalogue, ou décrivez-en une sur mesure',
    path: ['formationId'],
  })
  .refine((v) => v.clientKind !== 'company' || Boolean(v.companyId), {
    message: 'Entreprise cliente requise',
    path: ['companyId'],
  })
  .refine((v) => v.clientKind !== 'individual' || Boolean(v.learnerId), {
    message: 'Apprenant requis',
    path: ['learnerId'],
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
