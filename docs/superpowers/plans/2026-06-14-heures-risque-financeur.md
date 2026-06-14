# Suivi heures vs payées + abandon (risque financeur) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> ⛔ **PRÉ-REQUIS BLOQUANT** : ce plan réutilise `computeAssiduite` (`apps/web/features/attendance/assiduite.ts`), qui vit sur la branche **`feat/espace-ressources-tracabilite`** non encore mergée. **Ne pas démarrer l'exécution avant le merge de cette branche sur `main`** (sinon l'import de Task 3 ne résout pas). Vérifier : `git ls-tree origin/main apps/web/features/attendance/assiduite.ts` doit renvoyer un blob.

**Goal:** Alerter quand un dossier va finir **sous les heures payées** par le financeur, et gérer l'**abandon** — via une fonction pure `computeHoursRisk` (extension de `computeAssiduite`), des champs `abandoned_at`/`abandon_reason`, une query et un dashboard.

**Architecture:** Couche additive bâtie sur l'assiduité parallèle. `computeHoursRisk` (pur, testé) projette les heures (délivré + restant planifié, =0 si abandon) et compare à `total_hours` (payé). Migration additive pour l'abandon. Aucune refonte du domaine.

**Tech Stack:** Postgres (ALTER + pgTAP), TypeScript (fonction pure + Zod), Next.js Server Actions, Vitest.

**Spec de référence:** `docs/superpowers/specs/2026-06-14-heures-risque-financeur-design.md`

---

## File Structure

**Créés :**
- `supabase/migrations/0060_dossier_abandon.sql` — `abandoned_at` + `abandon_reason`.
- `supabase/tests/0060_test_dossier_abandon.sql` — pgTAP (champs + RLS).
- `apps/web/features/attendance/hours-risk.ts` — `computeHoursRisk` (pur, réutilise `computeAssiduite`).
- `apps/web/features/attendance/hours-risk.test.ts` — vitest.
- `apps/web/features/attendance/hours-status.query.ts` — query par dossier (RLS).
- `apps/web/app/(dashboard)/dossiers/[id]/heures/actions.ts` — `markDossierAbandoned` / `reactivateDossier` + Zod.
- `apps/web/app/(dashboard)/heures-risque/page.tsx` — dashboard des dossiers à risque.
- `apps/web/app/(dashboard)/heures-risque/abandon-button.tsx` — client (marquer/réactiver).

## Faits de codebase

- `computeAssiduite(sessions: { durationHours: number; signed: boolean }[]) : { heuresSignees, heuresPlanifiees, taux }` — `@/features/attendance/assiduite` (⛔ via branche parallèle, voir pré-requis).
- `app.dossiers.total_hours NUMERIC(8,2) NOT NULL` = heures payées. `app.sessions.duration_hours` (générée). Sessions ↔ dossier via `app.session_dossiers` (M2M, 0052). Présence : `app.attendance_signatures.status = 'present'` (par apprenant, via `attendance_sheet → session`).
- `app.session_status = planned | in_progress | done | cancelled` → « non done » = restant planifié (hors `cancelled`).
- Helpers RLS : `app.current_organization_id()`, `app.is_staff()`. Action ctx : `{ userId, email, supabase }` ; org via `resolveAdminOrgId` (cf. `formateurs/nouveau/actions.ts`).
- Prochain numéro migration libre = `0060` ; test = `0060` (main à 0059 après merge des PR #1-#4).
- ⚠️ Docker indispo local → migration/pgTAP write-only ; la CI (GitHub Actions, vrai Supabase) valide à l'ouverture de la PR. Vitest local OK.

---

## Task 1 : Migration `0060_dossier_abandon.sql` (write-only)

**Files:** Create `supabase/migrations/0060_dossier_abandon.sql`

- [ ] **Step 1 : Écrire**

```sql
-- ============================================================================
-- 0060 — Abandon de formation (additif sur le dossier)
-- ============================================================================
ALTER TABLE app.dossiers
  ADD COLUMN abandoned_at   TIMESTAMPTZ,
  ADD COLUMN abandon_reason TEXT;

COMMENT ON COLUMN app.dossiers.abandoned_at IS
  'Date d''abandon (NULL = en cours). Exclut le restant planifié de la projection d''heures.';
```

- [ ] **Step 2 : Replay (PENDING si Docker down)** — `pnpm db:reset`.
- [ ] **Step 3 : Commit** — `git add supabase/migrations/0060_dossier_abandon.sql && git commit -m "feat(dossier): champs abandon (abandoned_at, abandon_reason)"`

---

## Task 2 : pgTAP — abandon + RLS (write-only)

**Files:** Create `supabase/tests/0060_test_dossier_abandon.sql`

- [ ] **Step 1 : Écrire**

```sql
-- ============================================================================
-- Tests pgTAP : abandon dossier (écriture staff de l'org, isolation cross-tenant)
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
  ('1ea00000-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '00aaa000-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Lea', 'A', 'lea@of.test');
INSERT INTO app.dossiers (id, organization_id, reference, learner_id, formation_id, status, modality, start_date, end_date, total_hours, formation_snapshot)
SELECT 'd0a00000-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '00aaa000-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'DOS-ABN-1', '1ea00000-aaaa-aaaa-aaaa-aaaaaaaaaaaa', f.id, 'active', 'presentiel', now()::date, now()::date, 70, '{}'::jsonb
  FROM app.formations f WHERE f.organization_id = '00aaa000-aaaa-aaaa-aaaa-aaaaaaaaaaaa' LIMIT 1;

-- Owner de A marque l'abandon : OK
SELECT tests.as_authenticated();
SELECT tests.set_jwt('00aaa000-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'owner', 'owner-0a0-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
UPDATE app.dossiers SET abandoned_at = now(), abandon_reason = 'déménagement' WHERE id = 'd0a00000-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
SELECT isnt(
  (SELECT abandoned_at FROM app.dossiers WHERE id = 'd0a00000-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  NULL, 'Staff de l''org peut marquer l''abandon');

-- Org B ne voit pas / ne modifie pas le dossier de A
SELECT tests.clear_jwt();
SELECT tests.set_jwt('00bbb000-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'owner', 'owner-0a0-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
SELECT is(
  (SELECT count(*)::int FROM app.dossiers WHERE id = 'd0a00000-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  0, 'Org B ne voit pas le dossier de A (isolation RLS)');

SELECT * FROM finish();
ROLLBACK;
```

> Note : si une colonne NOT NULL de `dossiers` manque à l'INSERT, compléter via `0007_dossier.sql` (la `formation_snapshot` est requise ; une formation de l'org doit exister — en insérer une minimale au besoin, cf. plan multi-modalité Task 2).

- [ ] **Step 2 : Lancer** — `pnpm db:test` (PENDING si Docker down).
- [ ] **Step 3 : Commit** — `git add supabase/tests/0060_test_dossier_abandon.sql && git commit -m "test(dossier): pgTAP abandon + isolation RLS"`

---

## Task 3 : `computeHoursRisk` pur (TDD Vitest) — réutilise `computeAssiduite`

**Files:** Create `apps/web/features/attendance/hours-risk.ts` + `hours-risk.test.ts`

- [ ] **Step 1 : Test (échoue d'abord)**

```ts
import { describe, it, expect } from 'vitest';
import { computeHoursRisk } from './hours-risk';

describe('computeHoursRisk', () => {
  const s = (durationHours: number, signed: boolean, done: boolean) => ({ durationHours, signed, done });

  it('délivré = sessions signées ; projeté = délivré + restant planifié', () => {
    const r = computeHoursRisk({
      paidHours: 70,
      sessions: [s(7, true, true), s(7, true, true), s(7, false, false), s(7, false, false)],
      abandoned: false,
    });
    expect(r.delivered).toBe(14);            // 2 × 7 signées
    expect(r.scheduledRemaining).toBe(14);   // 2 × 7 non done
    expect(r.projected).toBe(28);
    expect(r.gapVsPaid).toBe(42);            // 70 − 28
    expect(r.atRisk).toBe(true);
  });

  it('abandon → restant = 0 → écart s\'aggrave', () => {
    const r = computeHoursRisk({
      paidHours: 70,
      sessions: [s(7, true, true), s(7, false, false)],
      abandoned: true,
    });
    expect(r.scheduledRemaining).toBe(0);
    expect(r.projected).toBe(7);
    expect(r.gapVsPaid).toBe(63);
    expect(r.atRisk).toBe(true);
  });

  it('100% assiduité mais sessions planifiées < payé → atRisk', () => {
    const r = computeHoursRisk({
      paidHours: 70,
      sessions: [s(35, true, true), s(20, false, false)], // tout présent/à venir mais total 55 < 70
      abandoned: false,
    });
    expect(r.projected).toBe(55);
    expect(r.gapVsPaid).toBe(15);
    expect(r.atRisk).toBe(true);
  });

  it('sur-doté → écart négatif, pas de risque', () => {
    const r = computeHoursRisk({
      paidHours: 14,
      sessions: [s(10, true, true), s(10, false, false)],
      abandoned: false,
    });
    expect(r.projected).toBe(20);
    expect(r.gapVsPaid).toBe(-6);
    expect(r.atRisk).toBe(false);
  });
});
```

- [ ] **Step 2 : Lancer pour échec** — `pnpm --filter web test hours-risk` → FAIL.
- [ ] **Step 3 : Implémenter** (réutilise `computeAssiduite` pour le délivré)

```ts
import { computeAssiduite } from './assiduite';

export type RiskSession = { durationHours: number; signed: boolean; done: boolean };

export type HoursRisk = {
  delivered: number;
  scheduledRemaining: number;
  projected: number;
  gapVsPaid: number;
  atRisk: boolean;
};

export function computeHoursRisk(args: {
  paidHours: number;
  sessions: RiskSession[];
  abandoned: boolean;
}): HoursRisk {
  // Délivré : réutilise computeAssiduite (cohérence avec l'assiduité)
  const { heuresSignees } = computeAssiduite(
    args.sessions.map((s) => ({ durationHours: s.durationHours, signed: s.signed })),
  );
  const delivered = heuresSignees;

  const scheduledRemaining = args.abandoned
    ? 0
    : args.sessions.reduce((acc, s) => (s.durationHours > 0 && !s.done ? acc + s.durationHours : acc), 0);

  const projected = delivered + scheduledRemaining;
  const gapVsPaid = args.paidHours - projected;
  return { delivered, scheduledRemaining, projected, gapVsPaid, atRisk: gapVsPaid > 0 };
}
```

- [ ] **Step 4 : Lancer pour succès** — `pnpm --filter web test hours-risk` → PASS (4 tests).
- [ ] **Step 5 : Commit** — `git add apps/web/features/attendance/hours-risk.ts apps/web/features/attendance/hours-risk.test.ts && git commit -m "feat(attendance): computeHoursRisk (projection vs heures payées, réutilise computeAssiduite)"`

---

## Task 4 : Query statut heures par dossier

**Files:** Create `apps/web/features/attendance/hours-status.query.ts`

- [ ] **Step 1 : Implémenter** (lire d'abord `convention.pdf/route.ts` pour le pattern de client/jointures, et `0052_session_dossiers.sql` pour la jointure M2M)

```ts
import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { computeHoursRisk, type RiskSession } from './hours-risk';

export type DossierHoursStatus = {
  dossierId: string;
  paid: number;
  delivered: number;
  scheduledRemaining: number;
  projected: number;
  gapVsPaid: number;
  atRisk: boolean;
  abandoned: boolean;
};

export async function getDossierHoursStatus(
  sb: SupabaseClient,
  dossierId: string,
): Promise<DossierHoursStatus | null> {
  const { data: d } = await sb
    .schema('app').from('dossiers')
    .select('id, total_hours, abandoned_at, learner_id')
    .eq('id', dossierId)
    .maybeSingle();
  if (!d) return null;
  const dossier = d as never as { id: string; total_hours: number; abandoned_at: string | null; learner_id: string };

  // Sessions du dossier (via M2M session_dossiers) : durée, statut, présence apprenant
  const { data: rows } = await sb
    .schema('app').from('session_dossiers')
    .select('sessions(id, duration_hours, status, attendance_sheets(attendance_signatures(status, learner_id)))')
    .eq('dossier_id', dossierId);

  const sessions: RiskSession[] = ((rows ?? []) as never as Array<{
    sessions: {
      duration_hours: number; status: string;
      attendance_sheets: Array<{ attendance_signatures: Array<{ status: string; learner_id: string | null }> }>;
    } | null;
  }>).flatMap((r) => {
    const s = r.sessions;
    if (!s) return [];
    const signed = s.attendance_sheets.some((sh) =>
      sh.attendance_signatures.some((sig) => sig.learner_id === dossier.learner_id && sig.status === 'present'),
    );
    return [{ durationHours: Number(s.duration_hours), signed, done: s.status === 'done' }];
  });

  const risk = computeHoursRisk({
    paidHours: Number(dossier.total_hours),
    sessions,
    abandoned: dossier.abandoned_at !== null,
  });

  return { dossierId, paid: Number(dossier.total_hours), abandoned: dossier.abandoned_at !== null, ...risk };
}
```

> Vérifier au plan : les noms exacts des relations imbriquées Supabase (`attendance_sheets`/`attendance_signatures`) et que `session_dossiers` lie bien la session au dossier (post-0052). Si la forme imbriquée diffère, ajuster le `.select` + le mapping (la logique `computeHoursRisk` ne change pas).

- [ ] **Step 2 : Typecheck delta** — `pnpm --filter web exec tsc --noEmit 2>&1 | grep hours-status` → corriger toute nouvelle erreur réelle (hors `@/env.mjs`).
- [ ] **Step 3 : Commit** — `git add apps/web/features/attendance/hours-status.query.ts && git commit -m "feat(attendance): query statut heures par dossier (vs payées)"`

---

## Task 5 : Action abandon / réactivation

**Files:** Create `apps/web/app/(dashboard)/dossiers/[id]/heures/actions.ts`

- [ ] **Step 1 : Implémenter** (réutilise `resolveAdminOrgId` — lire `formateurs/nouveau/actions.ts`)

```ts
'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { authActionClient } from '@/shared/lib/safe-action';

const AbandonSchema = z.object({ dossierId: z.string().uuid(), reason: z.string().trim().max(500).optional() });
const ReactivateSchema = z.object({ dossierId: z.string().uuid() });

export const markDossierAbandoned = authActionClient
  .schema(AbandonSchema)
  .action(async ({ parsedInput, ctx }) => {
    const { error } = await ctx.supabase.schema('app').from('dossiers')
      .update({ abandoned_at: new Date().toISOString(), abandon_reason: parsedInput.reason ?? null } as never)
      .eq('id', parsedInput.dossierId);
    if (error) throw new Error(`mark_abandoned_failed: ${error.message}`);
    revalidatePath('/heures-risque');
    return { ok: true as const };
  });

export const reactivateDossier = authActionClient
  .schema(ReactivateSchema)
  .action(async ({ parsedInput, ctx }) => {
    const { error } = await ctx.supabase.schema('app').from('dossiers')
      .update({ abandoned_at: null, abandon_reason: null } as never)
      .eq('id', parsedInput.dossierId);
    if (error) throw new Error(`reactivate_failed: ${error.message}`);
    revalidatePath('/heures-risque');
    return { ok: true as const };
  });
```

> L'écriture est protégée par la RLS `dossiers` (staff de l'org uniquement). Pas besoin de `resolveAdminOrgId` ici (l'`.eq('id', dossierId)` + RLS suffit) ; le garder en tête si une vérif org explicite est souhaitée.

- [ ] **Step 2 : Typecheck delta** — `... | grep "heures/actions"` → hors `@/env.mjs`.
- [ ] **Step 3 : Commit** — `git add "apps/web/app/(dashboard)/dossiers/[id]/heures/actions.ts" && git commit -m "feat(dossier): actions marquer abandon / réactiver"`

---

## Task 6 : Dashboard « heures à risque »

**Files:** Create `apps/web/app/(dashboard)/heures-risque/page.tsx` + `abandon-button.tsx`

- [ ] **Step 1 : Lire** `factures/page.tsx` (pattern lecture service_role) + un client appelant une action (`useAction().executeAsync`).

- [ ] **Step 2 : `abandon-button.tsx`**

```tsx
'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useAction } from 'next-safe-action/hooks';
import { Ban, RotateCcw } from 'lucide-react';
import { markDossierAbandoned, reactivateDossier } from '@/app/(dashboard)/dossiers/[id]/heures/actions';

export function AbandonButton({ dossierId, abandoned }: { dossierId: string; abandoned: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const mark = useAction(markDossierAbandoned);
  const react = useAction(reactivateDossier);

  const onClick = () =>
    start(async () => {
      if (abandoned) await react.executeAsync({ dossierId });
      else await mark.executeAsync({ dossierId });
      router.refresh();
    });

  return (
    <button type="button" onClick={onClick} disabled={pending}
      className="inline-flex items-center gap-1.5 text-[12px] px-2.5 py-1 rounded-lg border border-zinc-200/60 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-900 disabled:opacity-50">
      {abandoned ? <><RotateCcw className="w-3.5 h-3.5" /> Réactiver</> : <><Ban className="w-3.5 h-3.5 text-rose-600" /> Marquer abandon</>}
    </button>
  );
}
```

- [ ] **Step 3 : `page.tsx`** (archétype `command`, charte v3) — charge les dossiers actifs de l'org, calcule `getDossierHoursStatus` pour chacun, liste ceux `atRisk` (payé / délivré / projeté / **écart**), badge rouge si `gapVsPaid > 0`, marqueur abandon, `AbandonButton`. Utiliser le client service_role comme `factures/page.tsx` (documenter le tradeoff RLS), et boucler `getDossierHoursStatus(sb, d.id)` sur les dossiers non clôturés.

```tsx
// ARCHETYPE: command
// Justification: pilotage du risque "heures sous le payé financeur" + gestion des abandons.

import { createClient } from '@supabase/supabase-js';
import { env } from '@/env.mjs';
import { AlertTriangle } from 'lucide-react';
import { StatCard } from '@/shared/ui/stat-card';
import { getDossierHoursStatus } from '@/features/attendance/hours-status.query';
import { AbandonButton } from './abandon-button';

export const dynamic = 'force-dynamic';

export default async function HeuresRisquePage() {
  const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: dossiers } = await sb.schema('app').from('dossiers')
    .select('id, reference, abandoned_at')
    .not('status', 'in', '(closed,archived,cancelled)')
    .is('deleted_at', null);

  const rows = [];
  for (const d of ((dossiers ?? []) as unknown as Array<{ id: string; reference: string; abandoned_at: string | null }>)) {
    const st = await getDossierHoursStatus(sb as never, d.id);
    if (st) rows.push({ reference: d.reference, ...st });
  }
  const atRisk = rows.filter((r) => r.atRisk);

  return (
    <div className="max-w-7xl w-full mx-auto px-8 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100 tracking-tight">Heures à risque</h1>
        <p className="text-[14px] text-zinc-500 dark:text-zinc-400 mt-1">
          Dossiers dont le projeté finira sous les heures payées par le financeur.
        </p>
      </header>
      <section className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-6">
        <StatCard label="Dossiers à risque" value={atRisk.length} icon={AlertTriangle} accent={atRisk.length ? 'amber' : 'emerald'} />
      </section>
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-xl shadow-sm overflow-hidden">
        <div className="grid grid-cols-[1fr_90px_90px_90px_90px_160px] gap-3 px-5 py-2.5 text-[10px] uppercase tracking-wider text-zinc-400 border-b border-zinc-200/60 dark:border-zinc-800 bg-zinc-50/40 dark:bg-zinc-950/40">
          <div>Dossier</div><div>Payé</div><div>Délivré</div><div>Projeté</div><div>Écart</div><div></div>
        </div>
        {atRisk.length === 0 ? (
          <p className="px-5 py-10 text-center text-[13px] text-zinc-400">Aucun dossier à risque.</p>
        ) : (
          <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {atRisk.map((r) => (
              <li key={r.dossierId} className="grid grid-cols-[1fr_90px_90px_90px_90px_160px] gap-3 px-5 py-3 items-center text-[13px]">
                <span className="text-zinc-900 dark:text-zinc-100 truncate">{r.reference}{r.abandoned && <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded-full bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400">abandon</span>}</span>
                <span className="font-mono text-[12px] tabular-nums">{r.paid} h</span>
                <span className="font-mono text-[12px] tabular-nums">{r.delivered} h</span>
                <span className="font-mono text-[12px] tabular-nums">{r.projected} h</span>
                <span className="font-mono text-[12px] tabular-nums text-rose-600">−{r.gapVsPaid} h</span>
                <div className="flex justify-end"><AbandonButton dossierId={r.dossierId} abandoned={r.abandoned} /></div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
```

> Note perf : boucle `getDossierHoursStatus` par dossier (N requêtes) — acceptable à l'échelle d'un OF ; si volumineux, basculer plus tard en une vue SQL agrégée. Lecture `service_role` non-RLS comme `factures/page.tsx` — documenter, durcir en RLS si multi-tenant strict requis sur cet écran.

- [ ] **Step 3b : Typecheck delta** — `... | grep -E "heures-risque"` → hors `@/env.mjs`.
- [ ] **Step 4 : Commit** — `git add "apps/web/app/(dashboard)/heures-risque/page.tsx" "apps/web/app/(dashboard)/heures-risque/abandon-button.tsx" && git commit -m "feat(heures): dashboard dossiers à risque + bouton abandon"`

---

## Task 7 : Vérification finale

- [ ] **Step 1 : Suite TS** — `pnpm --filter web test` (dont `hours-risk`). `pnpm --filter web exec tsc --noEmit 2>&1 | grep -E "features/attendance/hours|heures-risque|heures/actions" | grep -v env.mjs` → aucune nouvelle erreur réelle.
- [ ] **Step 2 : DB (si Docker/CI)** — `pnpm db:reset && pnpm db:test && pnpm db:types` → migration `0060` + pgTAP verts, types régénérés. (La CI le fait à l'ouverture de la PR.)
- [ ] **Step 3 : Golden path manuel** — un dossier 70 h payées avec sessions planifiées totalisant 55 h → apparaît « à risque » (écart 15 h) ; marquer abandon → l'écart grimpe ; réactiver → revient.
- [ ] **Step 4 : Commit final si ajustements**.

---

## Self-Review

**1. Couverture spec :** §5 migration → T1. §10 pgTAP → T2. §6 `computeHoursRisk` → T3. §8 query → T4. §7 action abandon → T5. §9 dashboard → T6. §10 vitest → T3, golden path → T7. Dépendance `computeAssiduite` déclarée (en-tête + Faits). Toutes les sections couvertes.

**2. Placeholders :** renvois « lire le fichier » = pattern de lecture/relations Supabase à confirmer (T4/T6), avec le code fourni. Pas de TBD.

**3. Cohérence des types :** `RiskSession`/`HoursRisk`/`computeHoursRisk` (T3) consommés par `getDossierHoursStatus` (T4) ; `DossierHoursStatus` (T4) consommé par le dashboard (T6) ; actions `markDossierAbandoned`/`reactivateDossier` (T5) consommées par `AbandonButton` (T6). `computeAssiduite` réutilisé en T3 (signature `{durationHours, signed}[] → {heuresSignees,…}`).

**Risques résiduels :** (a) **dépendance bloquante** sur la branche parallèle (assiduite.ts) ; (b) forme exacte des relations imbriquées Supabase en T4 à valider ; (c) dashboard en lecture service_role + boucle N requêtes (acceptable OF, à durcir si besoin) ; (d) `abandoned_at`/`total_hours` absents de `database.ts` jusqu'à `db:types` → casts `as never`.
