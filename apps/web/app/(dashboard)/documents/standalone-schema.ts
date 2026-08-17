import { z } from 'zod';
import { TEMPLATE_KINDS } from './modeles/schema';

/**
 * Schéma de génération d'un document autonome. Hors du module `'use server'` :
 * un module de Server Actions ne peut exporter que des fonctions asynchrones.
 */
export const GenerateStandaloneAiSchema = z.object({
  kind: z.enum(TEMPLATE_KINDS).default('autre'),
  title: z.string().max(160).optional().default(''),
  instruction: z.string().min(5, 'Décrivez le document').max(2000),
});
