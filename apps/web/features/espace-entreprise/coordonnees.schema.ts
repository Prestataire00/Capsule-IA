import { z } from 'zod';

/**
 * Les coordonnées d'un salarié, corrigées par son entreprise depuis l'espace
 * (réunion avec Laurie, 16/10/2026) : e-mail et téléphone seulement — la
 * liste des inscrits reste à l'organisme. Partagé par le formulaire et l'action.
 */
export const coordonneesApprenantSchema = z.object({
  learnerId: z.string().uuid(),
  email: z
    .string()
    .trim()
    .max(200)
    .refine((v) => v === '' || z.string().email().safeParse(v).success, 'Adresse e-mail invalide.'),
  telephone: z
    .string()
    .trim()
    .max(30)
    .refine((v) => v === '' || /^[+0-9 ().-]{6,30}$/.test(v), 'Numéro de téléphone invalide.'),
});

export type CoordonneesApprenant = z.input<typeof coordonneesApprenantSchema>;
