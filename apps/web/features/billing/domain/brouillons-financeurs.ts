// Les factures brouillon suivent le plan de financement (vidéo d'Ismael,
// 15/10/2026) : le devis signé crée une facture brouillon à l'entreprise pour
// tout le montant ; quand un OPCO prend ensuite 5 000 € en charge, ce
// brouillon restait à l'entreprise et le reste à charge affichait −5 000 €.
// Un brouillon n'est pas encore une pièce comptable : on le réaffecte. Une
// facture émise, elle, ne bouge jamais (un avoir la corrige).
// Couche domaine pure.

import { buildBillingPlan, type FunderAllocationInput } from './billing-plan';

export type FactureDuDossier = {
  id: string;
  funderId: string | null;
  subtotalHtCents: number;
  status: string;
  kind: string;
};

export type Reaffectation =
  /** Le brouillon entier change de payeur (financeur, ou null = l'entreprise). */
  | { type: 'transferer'; invoiceId: string; funderId: string | null }
  /** Le brouillon garde `garderHtCents` ; un nouveau brouillon de `transfereHtCents` va au financeur. */
  | { type: 'scinder'; invoiceId: string; garderHtCents: number; funderId: string; transfereHtCents: number };

const reaffectable = (f: FactureDuDossier) => f.status === 'draft' && (f.kind === 'invoice' || f.kind === 'balance');

export function reaffecterBrouillons(
  totalHtCents: number,
  allocations: readonly FunderAllocationInput[],
  factures: readonly FactureDuDossier[],
): Reaffectation[] {
  const sortie: Reaffectation[] = [];
  const valides = new Set(allocations.filter((a) => a.status !== 'refused').map((a) => a.funderId));
  const courantes = factures.map((f) => ({ ...f }));

  // Un brouillon d'un financeur retiré ou refusé revient à l'entreprise.
  for (const f of courantes) {
    if (reaffectable(f) && f.funderId !== null && !valides.has(f.funderId)) {
      sortie.push({ type: 'transferer', invoiceId: f.id, funderId: null });
      f.funderId = null;
    }
  }

  const plan = () =>
    buildBillingPlan(
      totalHtCents,
      [...allocations],
      courantes.map((f) => ({ funderId: f.funderId, subtotalHtCents: f.subtotalHtCents, status: f.status, kind: f.kind })),
    );

  // Puis l'excédent du reste à charge part chez les financeurs qui ont de la marge.
  for (const allocation of allocations) {
    if (allocation.status === 'refused') continue;
    for (const f of courantes) {
      if (!reaffectable(f) || f.funderId !== null) continue;
      const p = plan();
      const excedent = -p.resteACharge.remainingHtCents;
      const marge = p.funders.find((l) => l.payer === allocation.funderId)?.remainingHtCents ?? 0;
      const part = Math.min(f.subtotalHtCents, marge, excedent);
      if (part <= 0) continue;
      if (part === f.subtotalHtCents) {
        sortie.push({ type: 'transferer', invoiceId: f.id, funderId: allocation.funderId });
        f.funderId = allocation.funderId;
      } else {
        sortie.push({ type: 'scinder', invoiceId: f.id, garderHtCents: f.subtotalHtCents - part, funderId: allocation.funderId, transfereHtCents: part });
        f.subtotalHtCents -= part;
        courantes.push({ id: `${f.id}:${allocation.funderId}`, funderId: allocation.funderId, subtotalHtCents: part, status: 'draft', kind: f.kind });
      }
    }
  }
  return sortie;
}
