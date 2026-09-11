// Types de facture — acomptes, solde, avoirs. Règles pures.
// Couche domaine : aucun import de next / @supabase / react / zod.

export type InvoiceKind = 'invoice' | 'deposit' | 'balance' | 'credit_note';

export const INVOICE_KIND_LABELS: Record<InvoiceKind, string> = {
  invoice: 'Facture',
  deposit: 'Facture d’acompte',
  balance: 'Facture de solde',
  credit_note: 'Avoir',
};

/** Particulier : pas plus de 30 % du prix à l'issue du délai de rétractation (art. L.6353-6). */
export const MAX_INDIVIDUAL_DEPOSIT_PERCENT = 30;

export type Amounts = { subtotalCents: number; vatCents: number; totalCents: number };

/** Acompte = pourcentage du devis, HT et TVA proportionnels. */
export function depositAmounts(quote: Amounts, percent: number): Amounts {
  const ratio = Math.min(100, Math.max(0, percent)) / 100;
  const subtotalCents = Math.round(quote.subtotalCents * ratio);
  const vatCents = Math.round(quote.vatCents * ratio);
  return { subtotalCents, vatCents, totalCents: subtotalCents + vatCents };
}

/** Solde = devis − acomptes facturés (jamais négatif). */
export function balanceAmounts(quote: Amounts, deposits: readonly Amounts[]): Amounts {
  const subtotalCents = Math.max(0, quote.subtotalCents - deposits.reduce((s, d) => s + d.subtotalCents, 0));
  const vatCents = Math.max(0, quote.vatCents - deposits.reduce((s, d) => s + d.vatCents, 0));
  return { subtotalCents, vatCents, totalCents: subtotalCents + vatCents };
}

/** Montant signé pour les totaux : un avoir vient en déduction. */
export function signedCents(kind: InvoiceKind | string | null | undefined, cents: number): number {
  return kind === 'credit_note' ? -cents : cents;
}

/** Ce qu'il reste à créditer sur une facture (TTC), déduction faite des avoirs déjà émis. */
export function creditableCents(invoiceTotalCents: number, creditedCents: number): number {
  return Math.max(0, invoiceTotalCents - creditedCents);
}

export type DepositError = 'percent_out_of_range' | 'individual_cap' | 'exceeds_quote';

/** Vérifie un acompte : 1 à 99 %, 30 % max pour un particulier, cumul ≤ 100 % du devis. */
export function checkDeposit(
  percent: number,
  clientKind: 'company' | 'individual',
  alreadyDepositedPercent: number,
): DepositError | null {
  if (!(percent > 0 && percent < 100)) return 'percent_out_of_range';
  if (clientKind === 'individual' && alreadyDepositedPercent + percent > MAX_INDIVIDUAL_DEPOSIT_PERCENT) {
    return 'individual_cap';
  }
  if (alreadyDepositedPercent + percent >= 100) return 'exceeds_quote';
  return null;
}

/**
 * Relance automatique due ? Première relance le lendemain de l'échéance, puis
 * tous les `intervalDays` jours, `max` relances au plus.
 */
export function reminderDue(args: {
  dueAt: string | null;
  today: string;
  reminderCount: number;
  lastReminderAt: string | null;
  intervalDays?: number;
  max?: number;
}): boolean {
  const { dueAt, today, reminderCount, lastReminderAt } = args;
  const interval = args.intervalDays ?? 15;
  const max = args.max ?? 3;
  if (!dueAt || dueAt >= today || reminderCount >= max) return false;
  if (!lastReminderAt) return true;
  const elapsed = (Date.parse(`${today}T12:00:00Z`) - Date.parse(lastReminderAt)) / 86_400_000;
  return elapsed >= interval;
}
