# Page `/financeurs` en données réelles (de-mock) — Design

> Statut : validé en brainstorming. Date : 2026-06-14 · Contexte : `crm` (funders). Zone claimée (CLAIMS.md).

## Problème
`(dashboard)/financeurs/page.tsx` lit le **mock** (`funders, dossiers, formatEuros`). Backend réel disponible.

## Audit
- `app.funders(id, organization_id, kind app.funder_kind, name, contact_email, contact_phone)`.
- `app.dossier_funders(dossier_id, funder_id, amount_cents BIGINT, share_percent)`.
- `app.dossiers(status, …)`.
- Page mock : StatCards (total financeurs, OPCO, CPF, total financé) + tableau montant/financeur + nb dossiers.
- Anti-doublon : hors zones parallèles, zone claimée.

## Décisions
- Query TS agrégée (RLS via `supabaseServer`), **sans migration ni vue** (YAGNI).
- Montant/financeur = `SUM(dossier_funders.amount_cents)` pour dossiers `active/completed/closed`.
- Hors périmètre : playbooks/tâches financeur, CRUD financeur.

## Composants
- `apps/web/features/funders/funders-overview.ts` (pur) : `countByKind(kinds: string[]): Record<string, number>`.
- `apps/web/features/funders/funders-overview.query.ts` : `getFundersOverview(sb): Promise<FundersOverview>` —
  `FunderRow = { id; kind; name; contactEmail: string|null; fundedCents: number; dossierCount: number }`,
  `FundersOverview = { funders: FunderRow[]; totalFunders: number; byKind: Record<string,number>; grandTotalCents: number }`.
- `(dashboard)/financeurs/page.tsx` : Server Component, remplace le mock ; StatCards + tableau réels. Charte v3.

## Tests
- Vitest : `countByKind`. Manuel : financeurs réels + montants cohérents, 0 mock.

## Ordre
1. `countByKind` + test. 2. `getFundersOverview`. 3. Page. 4. Golden path manuel.
