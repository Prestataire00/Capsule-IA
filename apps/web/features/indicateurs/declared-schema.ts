import { z } from 'zod';

/**
 * Schéma partagé entre le formulaire et la Server Action (règle projet : jamais
 * dupliqué). Tous les chiffres sont optionnels — on ne déclare que ce qu'on
 * connaît — mais la source ne l'est pas : en contrôle Qualiopi, un chiffre
 * déclaré doit pouvoir être rattaché à sa provenance.
 */
const entierOptionnel = z
  .union([z.literal(''), z.coerce.number().int().min(0).max(1_000_000)])
  .transform((v) => (v === '' ? null : v))
  .nullable();

const pourcentageOptionnel = z
  .union([z.literal(''), z.coerce.number().min(0).max(100)])
  .transform((v) => (v === '' ? null : v))
  .nullable();

export const declaredIndicatorSchema = z
  .object({
    id: z.string().uuid().optional(),
    formationId: z
      .union([z.literal(''), z.string().uuid()])
      .transform((v) => (v === '' ? null : v))
      .nullable(),
    year: z.coerce.number().int().min(2000).max(2100),
    learnersTrained: entierOptionnel,
    satisfactionRate: pourcentageOptionnel,
    satisfactionResponses: entierOptionnel,
    responseRate: pourcentageOptionnel,
    formationsDelivered: entierOptionnel,
    source: z.string().trim().min(1, 'Indiquez d’où viennent ces chiffres').max(200),
    note: z.string().trim().max(1000).optional().nullable(),
  })
  .refine(
    (v) =>
      v.learnersTrained !== null ||
      v.satisfactionRate !== null ||
      v.satisfactionResponses !== null ||
      v.responseRate !== null ||
      v.formationsDelivered !== null,
    { message: 'Renseignez au moins un chiffre', path: ['learnersTrained'] },
  )
  .refine((v) => v.satisfactionRate === null || (v.satisfactionResponses ?? 0) > 0, {
    message: 'Un taux de satisfaction a besoin de son nombre de réponses',
    path: ['satisfactionResponses'],
  });

export type DeclaredIndicatorInput = z.input<typeof declaredIndicatorSchema>;
export type DeclaredIndicatorValues = z.output<typeof declaredIndicatorSchema>;
