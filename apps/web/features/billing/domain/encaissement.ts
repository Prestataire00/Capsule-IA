// Ce qu'un dossier a rapporté, et ce qu'il doit encore (réunion avec Laurie,
// 16/10/2026 : « les dossiers peuvent être terminés, mais pas forcément
// soldés »). Couche domaine pure.

export type FactureEncaissement = { readonly status: string; readonly kind: string; readonly totalCents: number; readonly payeCents: number };

export type Encaissement = {
  /** Factures émises (TTC), avoirs déduits. */
  readonly factureCents: number;
  readonly encaisseCents: number;
  /** Reste dû : sur les factures émises, ou le montant du dossier tant que rien n'est facturé. */
  readonly resteCents: number;
  /** Rien n'est encore facturé dans Capsule. */
  readonly aFacturer: boolean;
  readonly regleHorsCrm: boolean;
};

const FINI = new Set(['completed', 'closed', 'archived']);

export function encaissement(input: {
  totalDossierCents: number | null;
  factures: readonly FactureEncaissement[];
  regleHorsCrm: boolean;
}): Encaissement {
  const emises = input.factures.filter((f) => f.status !== 'draft' && f.status !== 'cancelled');
  const factureCents = emises.reduce((t, f) => t + (f.kind === 'credit_note' ? -1 : 1) * Math.max(0, f.totalCents), 0);
  const encaisseCents = emises.filter((f) => f.kind !== 'credit_note').reduce((t, f) => t + Math.max(0, f.payeCents), 0);
  const aFacturer = emises.filter((f) => f.kind !== 'credit_note').length === 0;
  const resteCents = input.regleHorsCrm
    ? 0
    : aFacturer
      ? Math.max(0, input.totalDossierCents ?? 0)
      : Math.max(0, factureCents - encaisseCents);
  return { factureCents, encaisseCents, resteCents, aFacturer, regleHorsCrm: input.regleHorsCrm };
}

/**
 * Le montant s'affiche en rouge quand le dossier est fini (terminé, clos,
 * archivé, ou sa date de fin passée) et que tout n'est pas encaissé.
 */
export function impayeAAfficher(e: Encaissement, dossier: { status: string; endDate: string | null }, aujourdhui: string): boolean {
  if (e.resteCents <= 0 || dossier.status === 'cancelled') return false;
  return FINI.has(dossier.status) || (dossier.endDate !== null && dossier.endDate < aujourdhui);
}
