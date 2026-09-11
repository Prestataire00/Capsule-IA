// Règlements des factures — règles pures.
// Couche domaine : aucun import de next / @supabase / react / zod.

export const PAYMENT_METHODS = ['virement', 'cheque', 'cb', 'especes', 'opco', 'cpf', 'autre'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  virement: 'Virement',
  cheque: 'Chèque',
  cb: 'Carte bancaire',
  especes: 'Espèces',
  opco: 'OPCO (subrogation)',
  cpf: 'CPF',
  autre: 'Autre',
};

/** Échéance par défaut : 30 jours après l'émission. */
export const DEFAULT_PAYMENT_DAYS = 30;

/**
 * Statut d'une facture émise d'après ses encaissements. Tolérance d'un centime
 * (arrondis de ventilation) ; un trop-perçu reste « payée ».
 */
export function settlementStatus(totalCents: number, paidCents: number): 'paid' | 'partially_paid' | 'issued' {
  if (paidCents > 0 && paidCents >= totalCents - 1) return 'paid';
  if (paidCents > 0) return 'partially_paid';
  return 'issued';
}

export function remainingCents(totalCents: number, paidCents: number): number {
  return Math.max(0, totalCents - paidCents);
}
