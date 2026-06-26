// Plan de facturation d'un dossier multi-financé.
// Couche domaine pure : aucun import de next / @supabase / react / zod.
//
// Règle métier centrale (anti-double-facturation) :
//   - Σ des factures HT d'un dossier ≤ total HT du dossier ;
//   - par payeur (un financeur, ou le reste à charge entreprise/apprenant),
//     Σ des factures HT ≤ son montant alloué.
// Tout est rattaché à un seul dossier (le « dossier client »).

import type { Result } from '@/shared/lib/result';
import { ok, err } from '@/shared/lib/result';

export type FunderAllocationStatus = 'pending' | 'approved' | 'refused' | 'paid';

/** Allocation d'un financeur sur le dossier (table app.dossier_funders). */
export type FunderAllocationInput = {
  funderId: string;
  name: string;
  kind: string;
  allocatedHtCents: number;
  status: FunderAllocationStatus;
};

/** Une facture déjà rattachée au dossier (brouillon ou émise). */
export type InvoiceInput = {
  /** Financeur facturé, ou null = facturé à l'entreprise/apprenant (reste à charge). */
  funderId: string | null;
  /** Montant HT (app.invoices.subtotal_cents). */
  subtotalHtCents: number;
  status: string;
};

/** Identifiant de payeur : un financeur (funderId) ou le reste à charge (null). */
export type Payer = string | null;
export const RESTE_A_CHARGE: Payer = null;

export type PayerLine = {
  payer: Payer;
  label: string;
  /** kind du financeur, ou null pour le reste à charge. */
  kind: string | null;
  allocatedHtCents: number;
  invoicedHtCents: number;
  remainingHtCents: number;
  status: FunderAllocationStatus | null;
};

export type BillingPlan = {
  totalHtCents: number;
  funders: PayerLine[];
  resteACharge: PayerLine;
  /** Σ des allocations financeurs. */
  allocatedHtCents: number;
  /** Σ des factures non annulées. */
  invoicedHtCents: number;
  /** total − facturé (négatif si sur-facturé). */
  remainingHtCents: number;
  /** Σ allocations financeurs > total dossier. */
  overAllocated: boolean;
  /** Σ factures > total dossier (double facturation déjà constatée). */
  overBilled: boolean;
};

const CANCELLED = 'cancelled';

const sanitize = (cents: number): number => Math.max(0, Math.round(cents));

/** Construit le plan de facturation à partir du total, des allocations et des factures existantes. */
export function buildBillingPlan(
  totalHtCents: number,
  allocations: FunderAllocationInput[],
  invoices: InvoiceInput[],
): BillingPlan {
  const total = sanitize(totalHtCents);

  const active = invoices.filter((i) => i.status !== CANCELLED);
  const invoicedByFunder = new Map<string, number>();
  let invoicedResteACharge = 0;
  for (const inv of active) {
    const amount = sanitize(inv.subtotalHtCents);
    if (inv.funderId == null) {
      invoicedResteACharge += amount;
    } else {
      invoicedByFunder.set(inv.funderId, (invoicedByFunder.get(inv.funderId) ?? 0) + amount);
    }
  }

  const funders: PayerLine[] = allocations.map((a) => {
    const allocated = sanitize(a.allocatedHtCents);
    const invoiced = invoicedByFunder.get(a.funderId) ?? 0;
    return {
      payer: a.funderId,
      label: a.name,
      kind: a.kind,
      allocatedHtCents: allocated,
      invoicedHtCents: invoiced,
      remainingHtCents: allocated - invoiced,
      status: a.status,
    };
  });

  const allocatedTotal = funders.reduce((sum, f) => sum + f.allocatedHtCents, 0);
  const resteAllocated = Math.max(0, total - allocatedTotal);
  const resteACharge: PayerLine = {
    payer: RESTE_A_CHARGE,
    label: 'Reste à charge (entreprise / apprenant)',
    kind: null,
    allocatedHtCents: resteAllocated,
    invoicedHtCents: invoicedResteACharge,
    remainingHtCents: resteAllocated - invoicedResteACharge,
    status: null,
  };

  const invoicedTotal = active.reduce((sum, i) => sum + sanitize(i.subtotalHtCents), 0);

  return {
    totalHtCents: total,
    funders,
    resteACharge,
    allocatedHtCents: allocatedTotal,
    invoicedHtCents: invoicedTotal,
    remainingHtCents: total - invoicedTotal,
    overAllocated: allocatedTotal > total,
    overBilled: invoicedTotal > total,
  };
}

export type BillingGuardError =
  | 'amount_not_positive'
  | 'unknown_payer'
  | 'funder_refused'
  | 'exceeds_payer_allocation'
  | 'exceeds_dossier_total';

/**
 * Vérifie qu'on peut facturer `amountHtCents` au `payer` sans double facturation.
 * Retourne le restant après facturation, ou l'erreur métier bloquante.
 */
export function canBill(
  plan: BillingPlan,
  payer: Payer,
  amountHtCents: number,
): Result<{ remainingAfterHtCents: number }, BillingGuardError> {
  const amount = Math.round(amountHtCents);
  if (amount <= 0) return err('amount_not_positive');

  const line = payer == null ? plan.resteACharge : plan.funders.find((f) => f.payer === payer);
  if (!line) return err('unknown_payer');
  if (line.status === 'refused') return err('funder_refused');

  if (amount > line.remainingHtCents) return err('exceeds_payer_allocation');
  if (plan.invoicedHtCents + amount > plan.totalHtCents) return err('exceeds_dossier_total');

  return ok({ remainingAfterHtCents: line.remainingHtCents - amount });
}
