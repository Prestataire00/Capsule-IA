import { z } from 'zod';

// Schémas partagés entre l'éditeur de devis (client) et les Server Actions.

export const QuoteLineSchema = z.object({
  description: z.string().trim().min(1, 'Désignation requise').max(300),
  details: z.string().trim().max(500).nullable().default(null),
  quantity: z.number().positive('Quantité > 0').max(100_000),
  unitAmountCents: z.number().int().min(0).max(100_000_000),
  vatRate: z.number().min(0).max(100).nullable(),
});

export const SaveQuoteSchema = z.object({
  quoteId: z.string().uuid(),
  object: z.string().trim().min(3, 'Objet trop court').max(300),
  notes: z.string().trim().max(4000).nullable(),
  validUntil: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date de validité invalide'),
  vatRate: z.number().min(0).max(100),
  recipientName: z.string().trim().max(200).nullable(),
  recipientEmail: z.string().trim().email('E-mail du destinataire invalide').nullable(),
  lines: z.array(QuoteLineSchema).min(1, 'Au moins une ligne').max(50),
});
export type SaveQuoteValues = z.infer<typeof SaveQuoteSchema>;

export const QuoteIdSchema = z.object({ quoteId: z.string().uuid() });

export const QuoteStatusSchema = z.object({
  quoteId: z.string().uuid(),
  status: z.enum(['signed', 'refused', 'cancelled', 'draft']),
});

export const DossierQuoteSchema = z.object({ dossierId: z.string().uuid() });
