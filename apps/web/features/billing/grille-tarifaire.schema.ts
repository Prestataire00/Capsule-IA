import { z } from 'zod';

const euros = z.number({ invalid_type_error: 'Indiquez un montant.' }).min(0, 'Montant positif.').max(100000);

/** Réglage de la grille, saisi en euros — partagé formulaire ↔ action. */
export const grilleSchema = z
  .object({
    tarifStandard: euros,
    plancherHoraire: euros,
    coutFormateurHoraire: euros,
    paliers: z
      .array(z.object({ aPartirDe: z.number().int().min(2, 'Un palier commence à 2 stagiaires au moins.').max(1000), tarifHoraire: euros }))
      .max(10),
  })
  .refine((g) => new Set(g.paliers.map((p) => p.aPartirDe)).size === g.paliers.length, {
    message: 'Deux paliers commencent au même effectif.',
  });

export type GrilleSaisie = z.infer<typeof grilleSchema>;
