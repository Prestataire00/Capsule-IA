# Dashboard KPIs réels — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remplacer les KPIs en dur de la page d'accueil par des chiffres Qualiopi + commerciaux **réels et frais**, via une vue live `app.v_org_kpis` + une query + des compteurs « à traiter ».

**Architecture:** Vue non-matérialisée `SECURITY INVOKER` (contourne la mv figée, RLS héritée). Query TS lit la vue + 3 `count`. Helper pur pour le taux Qualiopi. La home branche les StatCards + « à traiter » ; le reste de la page reste mock (de-mock incrémental).

**Tech Stack:** Postgres (vue + pgTAP), TypeScript (Zod inutile ici, lecture), Next.js Server Component, Vitest.

**Spec de référence:** `docs/superpowers/specs/2026-06-14-dashboard-kpis-reels-design.md`

---

## File Structure

**Créés :**
- `supabase/migrations/0067_v_org_kpis.sql` — vue live des KPIs.
- `supabase/tests/0067_test_v_org_kpis_rls.sql` — pgTAP isolation cross-tenant.
- `apps/web/features/reports/org-kpis.ts` — `qualiopiCompletionRate` (pur) + types.
- `apps/web/features/reports/org-kpis.test.ts` — vitest.
- `apps/web/features/reports/org-kpis.query.ts` — `getOrgKpis` (vue + 3 count).

**Modifiés :**
- `apps/web/app/(dashboard)/page.tsx` — branche StatCards + « à traiter » sur `getOrgKpis`.

## Faits de codebase

- `app.dossiers` : `status` (`active|completed|closed|…`), `qualiopi_ready BOOLEAN`, `total_amount_cents`, `closed_at`, `deleted_at`.
- `app.questionnaire_responses` : `status app.questionnaire_response_status` (`pending|in_progress|completed|expired`), `nps INT (0..10)`, `dossier_id`.
- `app.document_signatures.status app.signature_status` (`pending|signed|declined|expired`).
- `app.attendance_consolidated` (vue, déjà sur main) : `organization_id, signed_count, expected_count, status`.
- Helper RLS : `app.current_organization_id()`. Mv figée existante : `reports.mv_org_kpis` (à NE PAS lire).
- Home `(dashboard)/page.tsx` : Server Component **mock** ; 4 StatCards (lignes ~87-90 : Dossiers actifs `128`, Heures réalisées, Formations, **Taux de complétion `87%`**) ; const « à traiter » (lignes ~43-46 : Documents à signer `18`, Émargements manquants `7`, Questionnaires `12`, Factures `3`).
- Migrations `main` ≤ `0062` ; branche parallèle réserve `0063-0066` (non mergée) → **prendre `0067`** (vérifier le prochain libre à l'exécution). Tests : `0067` aussi.
- ⚠️ Docker local indispo → migration/pgTAP write-only ; CI (Supabase réel) valide à la PR. `pnpm typecheck` jamais vert → gater sur « pas de nouvelle erreur sur mes fichiers » hors `@/env.mjs`. Casts `as never` pour la vue absente de `database.ts`.

---

## Task 1 : Migration `0067_v_org_kpis.sql` (write-only)

**Files:** Create `supabase/migrations/0067_v_org_kpis.sql`

- [ ] **Step 1 : Écrire**

```sql
-- ============================================================================
-- 0067 — Vue live des KPIs organisation (Qualiopi + commerciaux)
-- ============================================================================
-- Non-matérialisée : toujours fraîche (mv_org_kpis n'est jamais REFRESH).
-- SECURITY INVOKER : RLS des tables de base appliquée (isolation org gratuite).
-- ============================================================================
CREATE VIEW app.v_org_kpis WITH (security_invoker = true) AS
SELECT
  d.organization_id,
  COUNT(*) FILTER (WHERE d.status = 'active')                                         AS dossiers_active,
  COUNT(*) FILTER (WHERE d.status = 'closed'
                     AND d.closed_at >= date_trunc('month', now()))                  AS dossiers_closed_this_month,
  COUNT(*) FILTER (WHERE d.qualiopi_ready = false
                     AND d.status IN ('active','completed'))                          AS dossiers_qualiopi_blocking,
  COUNT(*) FILTER (WHERE d.status IN ('active','completed'))                          AS dossiers_active_completed,
  COALESCE(SUM(d.total_amount_cents) FILTER (WHERE d.status IN ('active','completed','closed')), 0) AS revenue_in_progress_cents,
  AVG(qr.nps) AS nps_avg
FROM app.dossiers d
LEFT JOIN app.questionnaire_responses qr ON qr.dossier_id = d.id AND qr.nps IS NOT NULL
WHERE d.deleted_at IS NULL
GROUP BY d.organization_id;

GRANT SELECT ON app.v_org_kpis TO authenticated;

COMMENT ON VIEW app.v_org_kpis IS
  'KPIs org en temps réel (Qualiopi + commerciaux). Vue live (≠ mv_org_kpis figée). SECURITY INVOKER.';
```

- [ ] **Step 2 : Replay (PENDING si Docker down)** — `pnpm db:reset`.
- [ ] **Step 3 : Commit** — `git add supabase/migrations/0067_v_org_kpis.sql && git commit -m "feat(reports): vue live v_org_kpis (KPIs Qualiopi + commerciaux)"`

---

## Task 2 : pgTAP — isolation `v_org_kpis` (write-only)

**Files:** Create `supabase/tests/0067_test_v_org_kpis_rls.sql`

- [ ] **Step 1 : Écrire**

```sql
-- ============================================================================
-- Tests pgTAP : app.v_org_kpis n'expose que l'organisation du JWT
-- ============================================================================
BEGIN;
SELECT plan(2);

SELECT tests.as_service_role();
INSERT INTO app.organizations (id, name, legal_name, siret) VALUES
  ('00aaa000-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'OF A', 'OF A SARL', '11111111111111'),
  ('00bbb000-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'OF B', 'OF B SARL', '22222222222222');
INSERT INTO auth.users (id, email, instance_id, aud, role) VALUES
  ('owner-0a0-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a@of.test', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');
INSERT INTO app.profiles (user_id, full_name, email) VALUES
  ('owner-0a0-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Owner A', 'a@of.test');
INSERT INTO app.members (organization_id, user_id, role, is_default_org) VALUES
  ('00aaa000-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'owner-0a0-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'owner'::app.member_role, true);
INSERT INTO app.learners (id, organization_id, first_name, last_name, email) VALUES
  ('1ea00000-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '00aaa000-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Lea', 'A', 'lea@of.test'),
  ('1eb00000-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '00bbb000-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Leo', 'B', 'leo@of.test');
INSERT INTO app.dossiers (id, organization_id, reference, learner_id, formation_id, status, modality, start_date, end_date, total_hours, total_amount_cents, formation_snapshot)
SELECT 'd0a00000-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '00aaa000-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'DOS-A', '1ea00000-aaaa-aaaa-aaaa-aaaaaaaaaaaa', f.id, 'active', 'presentiel', now()::date, now()::date, 70, 700000, '{}'::jsonb
  FROM app.formations f WHERE f.organization_id = '00aaa000-aaaa-aaaa-aaaa-aaaaaaaaaaaa' LIMIT 1;
INSERT INTO app.dossiers (id, organization_id, reference, learner_id, formation_id, status, modality, start_date, end_date, total_hours, total_amount_cents, formation_snapshot)
SELECT 'd0b00000-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '00bbb000-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'DOS-B', '1eb00000-bbbb-bbbb-bbbb-bbbbbbbbbbbb', f.id, 'active', 'presentiel', now()::date, now()::date, 70, 900000, '{}'::jsonb
  FROM app.formations f WHERE f.organization_id = '00bbb000-bbbb-bbbb-bbbb-bbbbbbbbbbbb' LIMIT 1;

-- Owner de A : ne voit QUE la ligne KPI de A
SELECT tests.as_authenticated();
SELECT tests.set_jwt('00aaa000-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'owner', 'owner-0a0-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
SELECT is((SELECT count(*)::int FROM app.v_org_kpis), 1, 'Org A ne voit qu''une ligne KPI (la sienne)');
SELECT is(
  (SELECT dossiers_active::int FROM app.v_org_kpis WHERE organization_id = '00aaa000-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  1, 'KPI de A : 1 dossier actif');

SELECT * FROM finish();
ROLLBACK;
```

> Note : si une formation n'existe pas pour l'org de test, en insérer une minimale avant le dossier (cf. plans précédents) ; compléter les colonnes NOT NULL de `dossiers` au besoin (`0007_dossier.sql`).

- [ ] **Step 2 : Lancer** — `pnpm db:test` (PENDING si Docker down).
- [ ] **Step 3 : Commit** — `git add supabase/tests/0067_test_v_org_kpis_rls.sql && git commit -m "test(reports): pgTAP isolation cross-tenant v_org_kpis"`

---

## Task 3 : Helper pur `qualiopiCompletionRate` (TDD Vitest)

**Files:** Create `apps/web/features/reports/org-kpis.ts` + `org-kpis.test.ts`

- [ ] **Step 1 : Test**

```ts
import { describe, it, expect } from 'vitest';
import { qualiopiCompletionRate } from './org-kpis';

describe('qualiopiCompletionRate', () => {
  it('proportion de dossiers non bloquants', () => {
    expect(qualiopiCompletionRate(10, 2)).toBeCloseTo(0.8, 5); // (10-2)/10
  });
  it('aucun dossier actif/complété → 1 (rien à bloquer)', () => {
    expect(qualiopiCompletionRate(0, 0)).toBe(1);
  });
  it('tous bloquants → 0', () => {
    expect(qualiopiCompletionRate(5, 5)).toBe(0);
  });
  it('borne dans [0,1] même si blocking incohérent', () => {
    expect(qualiopiCompletionRate(3, 9)).toBe(0);
  });
});
```

- [ ] **Step 2 : Lancer pour échec** — `pnpm --filter web test reports/org-kpis` → FAIL.
- [ ] **Step 3 : Implémenter**

```ts
export type OrgKpis = {
  dossiersActive: number;
  dossiersClosedThisMonth: number;
  qualiopiRate: number; // 0..1
  revenueInProgressCents: number;
  npsAvg: number | null;
  toSign: number;
  attendanceMissing: number;
  questionnairesPending: number;
};

export function qualiopiCompletionRate(activeCompleted: number, blocking: number): number {
  if (activeCompleted <= 0) return 1;
  const rate = (activeCompleted - blocking) / activeCompleted;
  return Math.max(0, Math.min(1, rate));
}
```

- [ ] **Step 4 : Lancer pour succès** — `pnpm --filter web test reports/org-kpis` → PASS.
- [ ] **Step 5 : Commit** — `git add apps/web/features/reports/org-kpis.ts apps/web/features/reports/org-kpis.test.ts && git commit -m "feat(reports): helper pur qualiopiCompletionRate + types OrgKpis"`

---

## Task 4 : Query `getOrgKpis`

**Files:** Create `apps/web/features/reports/org-kpis.query.ts`

- [ ] **Step 1 : Implémenter**

```ts
import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { qualiopiCompletionRate, type OrgKpis } from './org-kpis';

export async function getOrgKpis(sb: SupabaseClient): Promise<OrgKpis> {
  // Vue live (absente de database.ts → cast). RLS scope l'org via le JWT.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const kpiTable = sb.schema('app').from('v_org_kpis' as never) as any;
  const { data: k } = await kpiTable
    .select('dossiers_active, dossiers_closed_this_month, dossiers_qualiopi_blocking, dossiers_active_completed, revenue_in_progress_cents, nps_avg')
    .maybeSingle();
  const row = (k ?? {}) as {
    dossiers_active?: number; dossiers_closed_this_month?: number;
    dossiers_qualiopi_blocking?: number; dossiers_active_completed?: number;
    revenue_in_progress_cents?: number; nps_avg?: number | null;
  };

  const count = async (table: string, build: (q: any) => any): Promise<number> => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const base = sb.schema('app').from(table as never).select('*', { count: 'exact', head: true }) as any;
    const { count: c } = await build(base);
    return c ?? 0;
  };

  const toSign = await count('document_signatures', (q) => q.eq('status', 'pending'));
  const questionnairesPending = await count('questionnaire_responses', (q) => q.in('status', ['pending', 'in_progress']));
  // Émargements manquants : feuilles non finalisées dont signed < expected (vue attendance_consolidated)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const acTable = sb.schema('app').from('attendance_consolidated' as never) as any;
  const { data: acRows } = await acTable.select('signed_count, expected_count, status');
  const attendanceMissing = ((acRows ?? []) as Array<{ signed_count: number; expected_count: number; status: string }>)
    .filter((r) => r.status !== 'finalized' && Number(r.signed_count) < Number(r.expected_count)).length;

  return {
    dossiersActive: Number(row.dossiers_active ?? 0),
    dossiersClosedThisMonth: Number(row.dossiers_closed_this_month ?? 0),
    qualiopiRate: qualiopiCompletionRate(Number(row.dossiers_active_completed ?? 0), Number(row.dossiers_qualiopi_blocking ?? 0)),
    revenueInProgressCents: Number(row.revenue_in_progress_cents ?? 0),
    npsAvg: row.nps_avg ?? null,
    toSign,
    attendanceMissing,
    questionnairesPending,
  };
}
```

> Vérifier au plan : que `attendance_consolidated` est bien sur main (vue créée par la PR émargement, mergée) ; sinon retirer ce compteur ou le calculer via `attendance_sheets`. Les casts `as never`/`as any` suivent la convention repo (table/vue absente de `database.ts`).

- [ ] **Step 2 : Typecheck delta** — `pnpm --filter web exec tsc --noEmit 2>&1 | grep "reports/org-kpis.query"` → seules erreurs tolérées : `@/env.mjs`.
- [ ] **Step 3 : Commit** — `git add apps/web/features/reports/org-kpis.query.ts && git commit -m "feat(reports): query getOrgKpis (vue live + compteurs à traiter)"`

---

## Task 5 : Brancher la home `(dashboard)/page.tsx`

**Files:** Modify `apps/web/app/(dashboard)/page.tsx`

- [ ] **Step 1 : Lire** le fichier en entier pour repérer : la signature de la fonction (sync vs async), le client supabase éventuel, les 4 `StatCard` (≈ lignes 87-90) et la const « à traiter » (≈ lignes 43-46).

- [ ] **Step 2 : Rendre le composant async + charger les KPIs.** Ajouter en tête du fichier :

```ts
import { supabaseServer } from '@/shared/lib/supabase/server';
import { getOrgKpis } from '@/features/reports/org-kpis.query';
```

Transformer la déclaration en async et charger :

```tsx
export default async function DashboardHome() {
  const kpis = await getOrgKpis(supabaseServer());
  const euro = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
  // ... reste du composant
```

> Si la fonction a déjà un autre nom/signature, adapter sans changer le nom exporté.

- [ ] **Step 3 : Brancher les 4 StatCards** (remplacer les valeurs en dur ≈ lignes 87-90) :

```tsx
        <StatCard href="/dossiers" label="Dossiers actifs" value={kpis.dossiersActive} icon={FolderOpen} accent="purple" />
        <StatCard href="/factures" label="CA en cours" value={euro.format(kpis.revenueInProgressCents / 100)} icon={Clock} accent="emerald" />
        <StatCard href="/dossiers" label="Clôturés ce mois" value={kpis.dossiersClosedThisMonth} icon={GraduationCap} accent="blue" />
        <StatCard href="/qualiopi" label="Taux Qualiopi" value={`${Math.round(kpis.qualiopiRate * 100)}%`} icon={BarChart3} accent="amber" />
```

(Conserver les `icon`/`accent` existants ; retirer les `hint`/`hintTone` en dur « +12 ce mois » etc. qui n'ont plus de source réelle. Garder les imports d'icônes utilisés.)

- [ ] **Step 4 : Brancher « à traiter »** — remplacer les `count:` en dur (≈ lignes 43-46) par les valeurs KPIs. Si la const « à traiter » est définie au niveau module (hors composant), la déplacer **dans** le composant pour accéder à `kpis`, ou la transformer en fonction `(kpis) => [...]`. Exemple :

```tsx
  const toTreatItems = [
    { icon: FileSignature, label: 'Documents à signer', count: kpis.toSign, href: '/dossiers', color: 'violet' as const },
    { icon: ClipboardCheck, label: 'Émargements manquants', count: kpis.attendanceMissing, href: '/emargements', color: 'amber' as const },
    { icon: ClipboardList, label: 'Questionnaires à compléter', count: kpis.questionnairesPending, href: '/questionnaires', color: 'blue' as const },
  ];
```

(Retirer la ligne « Factures à envoyer » en dur si aucune source, ou la laisser — au choix ; ne pas inventer de compteur.)

- [ ] **Step 5 : Nettoyer les imports mock devenus inutiles** pour les parties branchées, **sans toucher** aux parties encore mock (chart, table dossiers, carte Qualiopi détaillée gardent leurs données mock). Lancer le typecheck delta : `pnpm --filter web exec tsc --noEmit 2>&1 | grep "(dashboard)/page" | grep -v env.mjs` → corriger toute nouvelle erreur (imports manquants/inutilisés).

- [ ] **Step 6 : Vérif visuelle (si possible)** — sinon s'assurer qu'aucune valeur des 4 StatCards / « à traiter » ne vient plus du mock.

- [ ] **Step 7 : Commit** — `git add "apps/web/app/(dashboard)/page.tsx" && git commit -m "feat(dashboard): KPIs en-tête + à-traiter en données réelles (remplace le mock)"`

---

## Task 6 : Vérification finale

- [ ] **Step 1 : Suite TS** — `pnpm --filter web test` (dont `reports/org-kpis`). `pnpm --filter web exec tsc --noEmit 2>&1 | grep -E "features/reports|\(dashboard\)/page" | grep -v env.mjs` → aucune nouvelle erreur réelle.
- [ ] **Step 2 : DB (CI ou Docker)** — `pnpm db:reset && pnpm db:test && pnpm db:types` → migration `0067` + pgTAP verts, types régénérés (`v_org_kpis` apparaît). Sinon PENDING (la CI valide à la PR).
- [ ] **Step 3 : Golden path manuel** — la home affiche des chiffres réels (taux Qualiopi calculé, dossiers actifs, CA en cours, compteurs à traiter) cohérents avec la base ; plus de « 87% » figé.
- [ ] **Step 4 : Commit final si ajustements**.

---

## Self-Review

**1. Couverture spec :** §5 vue → T1. §8 pgTAP → T2. §6 helper+query → T3 (pur) + T4 (query). §7 branchement → T5. §8 vitest → T3, golden path → T6. Toutes sections couvertes.

**2. Placeholders :** renvois « lire le fichier » = édition de la home existante (structure exacte à confirmer), avec le code/recette fournis. Pas de TBD.

**3. Cohérence des types :** `OrgKpis` + `qualiopiCompletionRate` (T3) consommés par `getOrgKpis` (T4) et la home (T5). Champs `dossiersActive/qualiopiRate/revenueInProgressCents/toSign/attendanceMissing/questionnairesPending` identiques de T3 à T5.

**Risques résiduels :** (a) numéro `0067` à confirmer libre (parallèle réserve 0063-0066 non mergés) ; (b) `attendance_consolidated` doit être sur main (PR émargement mergée — OK) ; (c) `v_org_kpis` absente de `database.ts` → casts `as never`/`as any` (convention repo) jusqu'à `db:types` ; (d) la home reste partiellement mock (assumé V1).
