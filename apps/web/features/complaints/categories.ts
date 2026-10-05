import { z } from 'zod';

/** Catégories d'une réclamation déposée en ligne — partagées entre les formulaires et leurs actions. */
export const COMPLAINT_CATEGORIES = ['pedagogie', 'organisation', 'accessibilite', 'administratif', 'relation', 'autre'] as const;
export type ComplaintCategory = (typeof COMPLAINT_CATEGORIES)[number];

export const CATEGORY_LABELS: Record<ComplaintCategory, string> = {
  pedagogie: 'Contenu / pédagogie',
  organisation: 'Organisation / logistique',
  accessibilite: 'Accessibilité',
  administratif: 'Administratif',
  relation: 'Relation formateur',
  autre: 'Autre',
};

/** Réclamation déposée par le référent d'un client, depuis son espace entreprise. */
export const reclamationEntrepriseSchema = z.object({
  token: z.string().trim().min(3),
  dossierId: z.union([z.literal(''), z.string().uuid()]),
  category: z.enum(COMPLAINT_CATEGORIES),
  subject: z.string().trim().min(3, 'Sujet trop court').max(200),
  description: z.string().trim().min(10, 'Description trop courte').max(5000),
});
