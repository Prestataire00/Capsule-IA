// Devis de formation — règles métier pures.
// Couche domaine : aucun import de next / @supabase / react / zod.
//
// Invariants (repris de RFC) :
//   - un devis par CLIENT : une entreprise (tous ses stagiaires d'une même
//     session) ou un particulier ;
//   - prix unitaire par défaut = tarif de la session, sinon tarif catalogue ;
//   - le montant contractuel est celui du devis, pas le tarif de session.

export type QuoteStatus = 'draft' | 'sent' | 'signed' | 'refused' | 'expired' | 'cancelled';
export type QuoteClientKind = 'company' | 'individual';

export const QUOTE_STATUS_LABELS: Record<QuoteStatus, string> = {
  draft: 'Brouillon',
  sent: 'Envoyé',
  signed: 'Signé',
  refused: 'Refusé',
  expired: 'Expiré',
  cancelled: 'Annulé',
};

export const QUOTE_VALIDITY_DAYS = 30;

export type QuoteLineInput = {
  description: string;
  details?: string | null;
  quantity: number;
  unitAmountCents: number;
  /** null = taux du devis. */
  vatRate: number | null;
};

export type VatBreakdown = { rate: number; baseCents: number; vatCents: number };

export type QuoteTotals = {
  subtotalCents: number;
  vatCents: number;
  totalCents: number;
  /** Ventilation par taux (art. 289 II CGI), taux croissants. */
  byRate: VatBreakdown[];
};

export function lineTotalCents(line: Pick<QuoteLineInput, 'quantity' | 'unitAmountCents'>): number {
  return Math.round(line.quantity * line.unitAmountCents);
}

export function computeQuoteTotals(lines: readonly QuoteLineInput[], quoteVatRate: number): QuoteTotals {
  const bases = new Map<number, number>();
  for (const line of lines) {
    const rate = line.vatRate ?? quoteVatRate;
    bases.set(rate, (bases.get(rate) ?? 0) + lineTotalCents(line));
  }
  const byRate = [...bases.entries()]
    .sort(([a], [b]) => a - b)
    .map(([rate, baseCents]) => ({ rate, baseCents, vatCents: Math.round((baseCents * rate) / 100) }));
  const subtotalCents = byRate.reduce((s, r) => s + r.baseCents, 0);
  const vatCents = byRate.reduce((s, r) => s + r.vatCents, 0);
  return { subtotalCents, vatCents, totalCents: subtotalCents + vatCents, byRate };
}

/** Tarif de la session s'il est fixé, sinon tarif catalogue de la formation. */
export function defaultUnitPriceCents(
  sessionPriceCents: number | null | undefined,
  formationPriceCents: number | null | undefined,
): number {
  if (sessionPriceCents != null && sessionPriceCents >= 0) return sessionPriceCents;
  return Math.max(0, formationPriceCents ?? 0);
}

export type QuoteClient =
  | { kind: 'company'; companyId: string }
  | { kind: 'individual'; learnerId: string };

/**
 * Client d'un dossier : l'entreprise qui commande (dossier rattaché à une
 * entreprise), sinon l'apprenant lui-même, à titre individuel.
 */
export function resolveQuoteClient(dossier: { companyId: string | null; learnerId: string }): QuoteClient {
  return dossier.companyId
    ? { kind: 'company', companyId: dossier.companyId }
    : { kind: 'individual', learnerId: dossier.learnerId };
}

export function clientKey(client: QuoteClient): string {
  return client.kind === 'company' ? `company:${client.companyId}` : `individual:${client.learnerId}`;
}

export function quoteObject(formationTitle: string, learners: number): string {
  return `Formation ${formationTitle} — ${learners} stagiaire${learners > 1 ? 's' : ''}`;
}

/** Le contenu d'un devis ne se modifie qu'en brouillon (après envoi : il est figé). */
export function canEditQuote(status: QuoteStatus): boolean {
  return status === 'draft';
}

/** Envoi (ou renvoi) en signature : brouillon, ou déjà envoyé mais pas encore signé. */
export function canSendQuote(status: QuoteStatus): boolean {
  return status === 'draft' || status === 'sent';
}

/** Un devis compte dans le CA prévisionnel et bloque un doublon tant qu'il n'est pas clos négativement. */
export function isQuoteActive(status: QuoteStatus): boolean {
  return status !== 'cancelled' && status !== 'refused' && status !== 'expired';
}

export function isQuoteExpired(status: QuoteStatus, validUntil: string, today: string): boolean {
  return status === 'sent' && validUntil < today;
}

export function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** « 1 500,50 », « 1500.5 » ou « 1 500 € » → centimes ; null si illisible. */
export function parseEurosToCents(raw: string): number | null {
  const cleaned = raw.replace(/[\s €]/g, '').replace(',', '.');
  if (!/^\d+(\.\d{0,2})?$/.test(cleaned)) return null;
  return Math.round(Number.parseFloat(cleaned) * 100);
}
