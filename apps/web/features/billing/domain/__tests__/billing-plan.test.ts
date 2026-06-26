import { describe, it, expect } from 'vitest';
import {
  buildBillingPlan,
  canBill,
  RESTE_A_CHARGE,
  type FunderAllocationInput,
  type InvoiceInput,
} from '../billing-plan';

const opco = (over: Partial<FunderAllocationInput> = {}): FunderAllocationInput => ({
  funderId: 'opco-1',
  name: 'OPCO Atlas',
  kind: 'opco',
  allocatedHtCents: 200_000,
  status: 'approved',
  ...over,
});

describe('buildBillingPlan', () => {
  it('dossier 3000€ : OPCO 2000€ → reste à charge 1000€, rien facturé', () => {
    const plan = buildBillingPlan(300_000, [opco()], []);
    expect(plan.totalHtCents).toBe(300_000);
    expect(plan.allocatedHtCents).toBe(200_000);
    expect(plan.funders[0]?.remainingHtCents).toBe(200_000);
    expect(plan.resteACharge.allocatedHtCents).toBe(100_000);
    expect(plan.resteACharge.remainingHtCents).toBe(100_000);
    expect(plan.invoicedHtCents).toBe(0);
    expect(plan.overBilled).toBe(false);
  });

  it('déduit le facturé par financeur et le reste à charge', () => {
    const invoices: InvoiceInput[] = [
      { funderId: 'opco-1', subtotalHtCents: 150_000, status: 'issued' },
      { funderId: null, subtotalHtCents: 40_000, status: 'draft' },
    ];
    const plan = buildBillingPlan(300_000, [opco()], invoices);
    expect(plan.funders[0]?.invoicedHtCents).toBe(150_000);
    expect(plan.funders[0]?.remainingHtCents).toBe(50_000);
    expect(plan.resteACharge.invoicedHtCents).toBe(40_000);
    expect(plan.resteACharge.remainingHtCents).toBe(60_000);
    expect(plan.invoicedHtCents).toBe(190_000);
    expect(plan.remainingHtCents).toBe(110_000);
  });

  it('ignore les factures annulées', () => {
    const invoices: InvoiceInput[] = [
      { funderId: 'opco-1', subtotalHtCents: 200_000, status: 'cancelled' },
    ];
    const plan = buildBillingPlan(300_000, [opco()], invoices);
    expect(plan.invoicedHtCents).toBe(0);
    expect(plan.funders[0]?.invoicedHtCents).toBe(0);
  });

  it('détecte la sur-allocation et la sur-facturation', () => {
    const plan = buildBillingPlan(
      100_000,
      [opco({ allocatedHtCents: 80_000 }), opco({ funderId: 'cpf-1', name: 'CPF', kind: 'cpf', allocatedHtCents: 60_000 })],
      [{ funderId: 'opco-1', subtotalHtCents: 120_000, status: 'issued' }],
    );
    expect(plan.overAllocated).toBe(true); // 140k > 100k
    expect(plan.overBilled).toBe(true); // 120k > 100k
    expect(plan.remainingHtCents).toBe(-20_000);
  });

  it('multi-financeurs : 2 OPCO + reste à charge', () => {
    const plan = buildBillingPlan(
      500_000,
      [
        opco({ funderId: 'a', name: 'A', allocatedHtCents: 200_000 }),
        opco({ funderId: 'b', name: 'B', allocatedHtCents: 250_000 }),
      ],
      [],
    );
    expect(plan.allocatedHtCents).toBe(450_000);
    expect(plan.resteACharge.allocatedHtCents).toBe(50_000);
  });
});

describe('canBill (garde anti-double-facturation)', () => {
  const plan = () =>
    buildBillingPlan(300_000, [opco()], [
      { funderId: 'opco-1', subtotalHtCents: 150_000, status: 'issued' },
    ]);

  it('autorise un montant ≤ restant du financeur', () => {
    const r = canBill(plan(), 'opco-1', 50_000);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.remainingAfterHtCents).toBe(0);
  });

  it('refuse au-delà du restant du financeur', () => {
    const r = canBill(plan(), 'opco-1', 60_000);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('exceeds_payer_allocation');
  });

  it('autorise le reste à charge dans sa limite', () => {
    const r = canBill(plan(), RESTE_A_CHARGE, 100_000);
    expect(r.ok).toBe(true);
  });

  it('refuse le reste à charge au-delà de sa limite', () => {
    const r = canBill(plan(), RESTE_A_CHARGE, 100_001);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('exceeds_payer_allocation');
  });

  it('refuse un montant nul ou négatif', () => {
    expect(canBill(plan(), 'opco-1', 0).ok).toBe(false);
    expect(canBill(plan(), 'opco-1', -10).ok).toBe(false);
  });

  it('refuse un financeur inconnu', () => {
    const r = canBill(plan(), 'inconnu', 10_000);
    if (!r.ok) expect(r.error).toBe('unknown_payer');
  });

  it('refuse un financeur au statut refusé', () => {
    const p = buildBillingPlan(300_000, [opco({ status: 'refused' })], []);
    const r = canBill(p, 'opco-1', 10_000);
    if (!r.ok) expect(r.error).toBe('funder_refused');
  });

  it('refuse si le total dossier serait dépassé même sous l\'allocation (sur-allocation)', () => {
    // total 100k, OPCO alloué 90k, reste à charge alloué 10k.
    // déjà facturé 80k au reste à charge → restant reste à charge 0 (ok),
    // mais OPCO peut encore 90k alors que global ne reste que 20k.
    const p = buildBillingPlan(
      100_000,
      [opco({ allocatedHtCents: 90_000 })],
      [{ funderId: null, subtotalHtCents: 80_000, status: 'issued' }],
    );
    const r = canBill(p, 'opco-1', 30_000); // ≤ 90k restant financeur mais 80k+30k > 100k
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('exceeds_dossier_total');
  });
});
