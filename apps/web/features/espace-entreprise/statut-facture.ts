/**
 * Où en est une facture vue par l'entreprise : réglée, à régler, réglée en
 * partie ou en retard, et ce qu'il reste à payer. Un avoir ne se paie pas. Pur.
 */
export type StatutFacture = 'emise' | 'payee' | 'partielle' | 'en_retard';

export function etatFacture(
  f: { kind: string | null; status: string; totalCents: number; regleCents: number; echeance: string | null },
  aujourdHui: string,
): { statut: StatutFacture; resteCents: number } {
  const avoir = f.kind === 'credit_note';
  const resteCents = avoir || f.status === 'paid' ? 0 : Math.max(0, f.totalCents - f.regleCents);
  if (resteCents === 0) return { statut: 'payee', resteCents };
  if (f.status === 'overdue' || (f.echeance !== null && f.echeance.slice(0, 10) < aujourdHui)) return { statut: 'en_retard', resteCents };
  return { statut: f.regleCents > 0 ? 'partielle' : 'emise', resteCents };
}
