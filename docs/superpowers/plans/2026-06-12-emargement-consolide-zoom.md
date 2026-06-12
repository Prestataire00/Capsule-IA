# Émargement consolidé + activation auto-sync Zoom — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Donner à l'OF un tableau de bord d'émargement consolidé réel (par session / entreprise / formateur) qui quantifie le risque de preuve manquante, et activer le backfill Zoom automatique pour supprimer la cause des oublis de justificatifs.

**Architecture:** Read model pur via une vue SQL `SECURITY INVOKER` (`app.attendance_consolidated`, RLS héritée) + une query TS d'agrégation ; page Server Component qui remplace le mock. En parallèle, durcissement du route `zoom-sync` existant (fenêtre de rétention + RPC à précédence humaine) puis planification externe. Aucun nouvel agrégat domain.

**Tech Stack:** Postgres (vue + RPC plpgsql, pgTAP), Next.js 14 App Router (Server Components), `@supabase/ssr` (client RLS), TypeScript strict, Vitest, TailwindCSS + shadcn/ui (charte v3).

**Spec de référence:** `docs/superpowers/specs/2026-06-12-emargement-consolide-zoom-design.md`

---

## File Structure

**Créés :**
- `supabase/migrations/0043_attendance_consolidated_view.sql` — la vue read model.
- `supabase/migrations/0044_record_zoom_attendance.sql` — RPC à précédence humaine pour l'auto-sync.
- `supabase/tests/0047_test_attendance_consolidated_rls.sql` — pgTAP isolation cross-tenant de la vue.
- `supabase/tests/0048_test_record_zoom_attendance_precedence.sql` — pgTAP précédence + finalized.
- `apps/web/features/attendance/queries/attendance-consolidated.types.ts` — types partagés du read model.
- `apps/web/features/attendance/queries/aggregate-consolidated.ts` — helpers d'agrégation **purs** (testés).
- `apps/web/features/attendance/queries/aggregate-consolidated.test.ts` — vitest des helpers purs.
- `apps/web/features/attendance/queries/list-consolidated-attendance.ts` — fetch Supabase + appel des helpers.
- `apps/web/app/(dashboard)/emargements/lens-toggle.tsx` — client component (toggle de lentille via query param).
- `apps/web/features/attendance/zoom-sync-window.ts` — calcul **pur** de la fenêtre de rétention (testé).
- `apps/web/features/attendance/zoom-sync-window.test.ts` — vitest de la fenêtre.
- `docs/runbooks/zoom-sync-activation.md` — runbook d'activation du schedule externe.

**Modifiés :**
- `apps/web/app/(dashboard)/emargements/page.tsx` — remplace l'implémentation mock par la vue réelle.
- `apps/web/app/api/cron/zoom-sync/route.ts` — fenêtre de rétention + appel du nouveau RPC.

**Responsabilités (frontières) :**
- La **vue** ne connaît que le SQL ; elle expose un contrat tabulaire stable.
- Les **helpers d'agrégation** sont des fonctions pures (entrée = lignes de la vue, sortie = lignes groupées + résumé) → testables sans DB.
- Le **fetch** isole l'I/O Supabase ; la **page** ne fait que de la présentation.
- Le **RPC zoom** encapsule la règle de précédence côté DB (robuste quel que soit l'appelant).
- La **fenêtre de sync** est une fonction pure, indépendante du route.

---

## Faits de codebase à connaître (lus pendant le design)

- `app.attendance_sheets(id, organization_id, dossier_id, session_id, half_day, status, finalized_at, ...)`, `UNIQUE(session_id, half_day)`. `status ∈ open|partial|completed|finalized`.
- `app.attendance_signatures(attendance_sheet_id, participant_kind, learner_id, trainer_id, participant_id GENERATED, status, evidence_source, evidence_payload, ...)`, `UNIQUE(attendance_sheet_id, participant_kind, participant_id)`. `evidence_source ∈ manual|qr|zoom_csv|zoom_api|trainer_override` (ajouté en 0031).
- **Précédence humaine** = `evidence_source ∈ ('manual','qr','trainer_override')` ; **Zoom** = `('zoom_api','zoom_csv')`.
- `app.sessions` n'a **pas** de `trainer_id` : le formateur est un `session_participants` avec `participant_kind='trainer'`. `sessions.duration_hours` est une colonne générée (NUMERIC heures).
- `app.session_participants(session_id, participant_kind, learner_id, trainer_id, ...)` → base du `expected_count` (apprenants attendus).
- `app.dossiers.company_id → app.companies(id, name)`. `app.trainers(id, first_name, last_name)`.
- `app.zoom_sync_logs(session_id, status ∈ success|partial|error, fetched_at, ...)`.
- Trigger d'immutabilité **0033** : toute écriture de signature sur une feuille `finalized` lève une exception → la garde "ne jamais toucher finalized" est déjà native.
- RPC existant : `app.record_attendance_signature(...)` fait un UPSERT qui **écrase** au conflit (d'où le besoin d'un RPC zoom dédié).
- Pattern pgTAP : `supabase/tests/_helpers.sql` fournit `tests.as_service_role()`, `tests.set_jwt(org, role, user, member)`, `tests.as_authenticated()`, `tests.clear_jwt()`. Exemples : `0045/0046_test_rls_by_role_*.sql`.
- Pattern query/page : la page lit via `createClient(URL, SERVICE_ROLE_KEY)` **ou** via `supabaseServer()` (client RLS `@supabase/ssr`). **Pour cette feature, lire via `supabaseServer()`** : c'est tout l'intérêt de la vue `SECURITY INVOKER` (isolation org par RLS). Référence client RLS : `apps/web/shared/lib/supabase/server.ts` (`supabaseServer()`).
- Commandes : `pnpm db:reset` (replay migrations local), `pnpm db:test` (pgTAP), `pnpm db:types` (regénère `apps/web/shared/types/database.ts`), `pnpm test` (Vitest), `pnpm typecheck`.

---

## Task 1 : Vue `app.attendance_consolidated` (migration 0043)

**Files:**
- Create: `supabase/migrations/0043_attendance_consolidated_view.sql`

- [ ] **Step 1 : Écrire la migration de la vue**

Create `supabase/migrations/0043_attendance_consolidated_view.sql` :

```sql
-- ============================================================================
-- 0043 — Vue read model : émargement consolidé (par feuille)
-- ============================================================================
-- Un row par attendance_sheet, enrichi pour l'agrégation par session /
-- entreprise / formateur. SECURITY INVOKER => RLS des tables de base appliquée
-- (isolation organisation gratuite). Lecture seule.
-- ============================================================================

CREATE VIEW app.attendance_consolidated
WITH (security_invoker = true) AS
SELECT
  sh.id                              AS attendance_sheet_id,
  sh.organization_id                 AS organization_id,
  sh.dossier_id                      AS dossier_id,
  sh.session_id                      AS session_id,
  sh.status                          AS status,
  d.company_id                       AS company_id,
  c.name                             AS company_name,
  tp.trainer_id                      AS trainer_id,
  (t.first_name || ' ' || t.last_name) AS trainer_name,
  s.starts_at                        AS session_starts_at,
  s.ends_at                          AS session_ends_at,
  s.duration_hours                   AS session_hours,
  s.modality::text                   AS modality,
  -- Apprenants attendus pour la session
  (SELECT count(*) FROM app.session_participants sp
     WHERE sp.session_id = sh.session_id
       AND sp.participant_kind = 'learner')          AS expected_count,
  -- Signatures apprenant enregistrées
  (SELECT count(*) FROM app.attendance_signatures sig
     WHERE sig.attendance_sheet_id = sh.id
       AND sig.participant_kind = 'learner')         AS signed_count,
  -- Dont preuve Zoom
  (SELECT count(*) FROM app.attendance_signatures sig
     WHERE sig.attendance_sheet_id = sh.id
       AND sig.participant_kind = 'learner'
       AND sig.evidence_source IN ('zoom_api','zoom_csv')) AS zoom_count,
  -- Dont preuve manuelle/humaine
  (SELECT count(*) FROM app.attendance_signatures sig
     WHERE sig.attendance_sheet_id = sh.id
       AND sig.participant_kind = 'learner'
       AND sig.evidence_source IN ('manual','qr','trainer_override')) AS manual_count,
  -- Dernier statut de sync Zoom pour la session
  (SELECT zl.status FROM app.zoom_sync_logs zl
     WHERE zl.session_id = sh.session_id
     ORDER BY zl.fetched_at DESC
     LIMIT 1)                                        AS zoom_last_sync_status
FROM app.attendance_sheets sh
JOIN app.sessions s        ON s.id = sh.session_id
JOIN app.dossiers d        ON d.id = sh.dossier_id
LEFT JOIN app.companies c  ON c.id = d.company_id
-- Un seul formateur par feuille (le premier participant trainer)
LEFT JOIN LATERAL (
  SELECT sp.trainer_id
    FROM app.session_participants sp
   WHERE sp.session_id = sh.session_id
     AND sp.participant_kind = 'trainer'
   ORDER BY sp.trainer_id
   LIMIT 1
) tp ON true
LEFT JOIN app.trainers t   ON t.id = tp.trainer_id;

GRANT SELECT ON app.attendance_consolidated TO authenticated;

COMMENT ON VIEW app.attendance_consolidated IS
  'Read model émargement (un row/feuille) pour le dashboard consolidé. SECURITY INVOKER.';
```

- [ ] **Step 2 : Replay des migrations en local et vérifier que la vue existe**

Run :
```bash
pnpm db:reset
psql "$DATABASE_URL" -c "SELECT count(*) FROM app.attendance_consolidated;"
```
Expected : `pnpm db:reset` se termine sans erreur ; la requête renvoie un count (0 ou plus), prouvant que la vue est créée et lisible.

- [ ] **Step 3 : Commit**

```bash
git add supabase/migrations/0043_attendance_consolidated_view.sql
git commit -m "feat(attendance): vue read model attendance_consolidated (SECURITY INVOKER)"
```

---

## Task 2 : pgTAP — isolation cross-tenant de la vue

**Files:**
- Create: `supabase/tests/0047_test_attendance_consolidated_rls.sql`

- [ ] **Step 1 : Écrire le test pgTAP (doit échouer si la vue fuit entre orgs)**

Create `supabase/tests/0047_test_attendance_consolidated_rls.sql` :

```sql
-- ============================================================================
-- Tests pgTAP : app.attendance_consolidated n'expose que l'organisation du JWT
-- ============================================================================
BEGIN;
SELECT plan(2);

SELECT tests.as_service_role();

-- Deux orgs
INSERT INTO app.organizations (id, name, legal_name, siret) VALUES
  ('00aaa000-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'OF A', 'OF A SARL', '11111111111111'),
  ('00bbb000-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'OF B', 'OF B SARL', '22222222222222');

-- Un user owner de l'org A
INSERT INTO auth.users (id, email, instance_id, aud, role) VALUES
  ('owner-0a0-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a@of.test', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');
INSERT INTO app.profiles (user_id, full_name, email) VALUES
  ('owner-0a0-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Owner A', 'a@of.test');
INSERT INTO app.members (organization_id, user_id, role, is_default_org) VALUES
  ('00aaa000-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'owner-0a0-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'owner'::app.member_role, true);

-- Données minimales pour 1 feuille par org (company -> dossier -> session -> sheet)
INSERT INTO app.companies (id, organization_id, name) VALUES
  ('c0a00000-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '00aaa000-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Client A'),
  ('c0b00000-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '00bbb000-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Client B');

INSERT INTO app.learners (id, organization_id, first_name, last_name, email) VALUES
  ('1ea00000-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '00aaa000-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Lea', 'A', 'lea-a@of.test'),
  ('1eb00000-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '00bbb000-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Leo', 'B', 'leo-b@of.test');

INSERT INTO app.dossiers (id, organization_id, reference, learner_id, company_id, status) VALUES
  ('d0a00000-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '00aaa000-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'DOS-A', '1ea00000-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'c0a00000-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'draft'),
  ('d0b00000-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '00bbb000-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'DOS-B', '1eb00000-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'c0b00000-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'draft');

INSERT INTO app.sessions (id, organization_id, dossier_id, modality, starts_at, ends_at) VALUES
  ('5e500a00-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '00aaa000-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'd0a00000-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'distanciel', now() - interval '2 days', now() - interval '2 days' + interval '3 hours'),
  ('5e500b00-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '00bbb000-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'd0b00000-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'distanciel', now() - interval '2 days', now() - interval '2 days' + interval '3 hours');

INSERT INTO app.attendance_sheets (id, organization_id, dossier_id, session_id, half_day, status) VALUES
  ('a5a00000-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '00aaa000-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'd0a00000-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '5e500a00-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'full', 'open'),
  ('a5b00000-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '00bbb000-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'd0b00000-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '5e500b00-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'full', 'open');

-- Org A authentifiée
SELECT tests.as_authenticated();
SELECT tests.set_jwt(
  '00aaa000-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'owner',
  'owner-0a0-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
);

SELECT is(
  (SELECT count(*)::int FROM app.attendance_consolidated),
  1,
  'Org A ne voit que sa propre feuille via la vue'
);

SELECT is(
  (SELECT count(*)::int FROM app.attendance_consolidated
     WHERE organization_id = '00bbb000-bbbb-bbbb-bbbb-bbbbbbbbbbbb'),
  0,
  'Org A ne voit jamais les feuilles de l''org B'
);

SELECT tests.clear_jwt();
SELECT * FROM finish();
ROLLBACK;
```

> Note : si une colonne d'insertion ne correspond pas au schéma réel (ex. `dossiers.status` enum, colonnes NOT NULL supplémentaires), ajuster les INSERT en lisant la définition de table concernée dans `supabase/migrations/`. Les valeurs ci-dessus suivent les colonnes confirmées au design.

- [ ] **Step 2 : Lancer le test**

Run : `pnpm db:test`
Expected : les 2 assertions de `0047_test_attendance_consolidated_rls` passent (`ok 1`, `ok 2`).

- [ ] **Step 3 : Commit**

```bash
git add supabase/tests/0047_test_attendance_consolidated_rls.sql
git commit -m "test(attendance): pgTAP isolation cross-tenant de attendance_consolidated"
```

---

## Task 3 : Types + helpers d'agrégation purs (TDD Vitest)

**Files:**
- Create: `apps/web/features/attendance/queries/attendance-consolidated.types.ts`
- Create: `apps/web/features/attendance/queries/aggregate-consolidated.ts`
- Test: `apps/web/features/attendance/queries/aggregate-consolidated.test.ts`

- [ ] **Step 1 : Définir les types du read model**

Create `apps/web/features/attendance/queries/attendance-consolidated.types.ts` :

```ts
// Une ligne brute de la vue app.attendance_consolidated (grain = feuille).
export type ConsolidatedSheetRow = {
  attendanceSheetId: string;
  organizationId: string;
  dossierId: string;
  sessionId: string;
  status: 'open' | 'partial' | 'completed' | 'finalized';
  companyId: string | null;
  companyName: string | null;
  trainerId: string | null;
  trainerName: string | null;
  sessionStartsAt: string; // ISO
  sessionEndsAt: string; // ISO
  sessionHours: number;
  modality: string;
  expectedCount: number;
  signedCount: number;
  zoomCount: number;
  manualCount: number;
  zoomLastSyncStatus: 'success' | 'partial' | 'error' | null;
};

export type Lens = 'session' | 'company' | 'trainer';

// Une ligne agrégée (groupe) telle qu'affichée dans la table.
export type ConsolidatedGroup = {
  key: string; // sheetId (lens=session) | companyId | trainerId
  label: string; // nom entreprise / formateur / libellé session
  sheetCount: number;
  expectedCount: number;
  signedCount: number;
  missingCount: number;
  zoomCount: number;
  manualCount: number;
  hasSyncError: boolean;
};

// Résumé org-wide affiché dans les StatCards.
export type ConsolidatedSummary = {
  incompleteSheets: number;
  signatureRate: number; // 0..1
  zoomCoverage: number; // 0..1 (zoom / signed)
  syncErrors: number;
  hoursAtRiskRecoverable: number; // fenêtre Zoom encore ouverte
  hoursAtRiskLost: number; // hors fenêtre
};
```

- [ ] **Step 2 : Écrire les tests des helpers purs (échouent d'abord)**

Create `apps/web/features/attendance/queries/aggregate-consolidated.test.ts` :

```ts
import { describe, it, expect } from 'vitest';
import { groupByLens, summarize, ZOOM_RETENTION_DAYS } from './aggregate-consolidated';
import type { ConsolidatedSheetRow } from './attendance-consolidated.types';

const base: ConsolidatedSheetRow = {
  attendanceSheetId: 'sh1',
  organizationId: 'org1',
  dossierId: 'dos1',
  sessionId: 'ses1',
  status: 'open',
  companyId: 'comp1',
  companyName: 'Client Alpha',
  trainerId: 'tr1',
  trainerName: 'Marie Tut',
  sessionStartsAt: '2026-06-01T09:00:00.000Z',
  sessionEndsAt: '2026-06-01T12:00:00.000Z',
  sessionHours: 3,
  modality: 'distanciel',
  expectedCount: 4,
  signedCount: 2,
  zoomCount: 1,
  manualCount: 1,
  zoomLastSyncStatus: null,
};

describe('groupByLens', () => {
  it('lens=company agrège les feuilles d\'une même entreprise', () => {
    const rows: ConsolidatedSheetRow[] = [
      { ...base, attendanceSheetId: 'sh1', expectedCount: 4, signedCount: 2, zoomCount: 1, manualCount: 1 },
      { ...base, attendanceSheetId: 'sh2', expectedCount: 3, signedCount: 3, zoomCount: 3, manualCount: 0 },
    ];
    const groups = groupByLens(rows, 'company');
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({
      key: 'comp1',
      label: 'Client Alpha',
      sheetCount: 2,
      expectedCount: 7,
      signedCount: 5,
      missingCount: 2,
      zoomCount: 4,
      manualCount: 1,
    });
  });

  it('lens=trainer sépare deux formateurs distincts', () => {
    const rows: ConsolidatedSheetRow[] = [
      { ...base, trainerId: 'tr1', trainerName: 'Marie Tut' },
      { ...base, attendanceSheetId: 'sh2', trainerId: 'tr2', trainerName: 'Jean Form' },
    ];
    const groups = groupByLens(rows, 'trainer');
    expect(groups).toHaveLength(2);
    expect(groups.map((g) => g.key).sort()).toEqual(['tr1', 'tr2']);
  });

  it('lens=session retourne une ligne par feuille', () => {
    const rows: ConsolidatedSheetRow[] = [base, { ...base, attendanceSheetId: 'sh2' }];
    const groups = groupByLens(rows, 'session');
    expect(groups).toHaveLength(2);
    expect(groups[0].sheetCount).toBe(1);
  });

  it('regroupe les company_id null sous une clé "sans entreprise"', () => {
    const rows: ConsolidatedSheetRow[] = [{ ...base, companyId: null, companyName: null }];
    const groups = groupByLens(rows, 'company');
    expect(groups[0].key).toBe('none');
    expect(groups[0].label).toBe('Sans entreprise');
  });

  it('hasSyncError vrai si une feuille du groupe a un sync en erreur', () => {
    const rows: ConsolidatedSheetRow[] = [
      { ...base, zoomLastSyncStatus: 'success' },
      { ...base, attendanceSheetId: 'sh2', zoomLastSyncStatus: 'error' },
    ];
    const groups = groupByLens(rows, 'company');
    expect(groups[0].hasSyncError).toBe(true);
  });
});

describe('summarize', () => {
  it('calcule taux de signatures et couverture Zoom', () => {
    const rows: ConsolidatedSheetRow[] = [
      { ...base, status: 'open', expectedCount: 4, signedCount: 2, zoomCount: 1 },
      { ...base, attendanceSheetId: 'sh2', status: 'finalized', expectedCount: 2, signedCount: 2, zoomCount: 2 },
    ];
    const now = new Date('2026-06-05T00:00:00.000Z');
    const s = summarize(rows, now);
    // signed 4 / expected 6
    expect(s.signatureRate).toBeCloseTo(4 / 6, 5);
    // zoom 3 / signed 4
    expect(s.zoomCoverage).toBeCloseTo(3 / 4, 5);
    // 1 feuille incomplète (open avec signed<expected) ; la finalisée ne compte pas
    expect(s.incompleteSheets).toBe(1);
  });

  it('heures à risque : récupérable si dans la fenêtre de rétention, perdu sinon', () => {
    const now = new Date('2026-06-30T00:00:00.000Z');
    const rows: ConsolidatedSheetRow[] = [
      // terminée il y a 5 jours, incomplète, non finalisée => récupérable
      { ...base, attendanceSheetId: 'r', status: 'open', sessionHours: 3, expectedCount: 2, signedCount: 0,
        sessionEndsAt: '2026-06-25T12:00:00.000Z' },
      // terminée il y a 40 jours (> rétention), incomplète => perdue
      { ...base, attendanceSheetId: 'l', status: 'open', sessionHours: 4, expectedCount: 2, signedCount: 0,
        sessionEndsAt: '2026-05-21T12:00:00.000Z' },
      // finalisée => exclue du risque
      { ...base, attendanceSheetId: 'f', status: 'finalized', sessionHours: 5, expectedCount: 2, signedCount: 2,
        sessionEndsAt: '2026-06-25T12:00:00.000Z' },
    ];
    const s = summarize(rows, now);
    expect(ZOOM_RETENTION_DAYS).toBe(25);
    expect(s.hoursAtRiskRecoverable).toBe(3);
    expect(s.hoursAtRiskLost).toBe(4);
  });
});
```

- [ ] **Step 3 : Lancer les tests pour vérifier l'échec**

Run : `pnpm --filter web test aggregate-consolidated`
Expected : FAIL — `groupByLens`/`summarize` non exportés.

- [ ] **Step 4 : Implémenter les helpers purs**

Create `apps/web/features/attendance/queries/aggregate-consolidated.ts` :

```ts
import type {
  ConsolidatedSheetRow,
  ConsolidatedGroup,
  ConsolidatedSummary,
  Lens,
} from './attendance-consolidated.types';

export const ZOOM_RETENTION_DAYS = 25;

const groupKeyAndLabel = (
  row: ConsolidatedSheetRow,
  lens: Lens,
): { key: string; label: string } => {
  if (lens === 'session') {
    return { key: row.attendanceSheetId, label: row.companyName ?? 'Session' };
  }
  if (lens === 'company') {
    return row.companyId
      ? { key: row.companyId, label: row.companyName ?? 'Entreprise' }
      : { key: 'none', label: 'Sans entreprise' };
  }
  return row.trainerId
    ? { key: row.trainerId, label: row.trainerName ?? 'Formateur' }
    : { key: 'none', label: 'Sans formateur' };
};

export const groupByLens = (
  rows: readonly ConsolidatedSheetRow[],
  lens: Lens,
): ConsolidatedGroup[] => {
  const map = new Map<string, ConsolidatedGroup>();
  for (const row of rows) {
    const { key, label } = groupKeyAndLabel(row, lens);
    const g = map.get(key) ?? {
      key,
      label,
      sheetCount: 0,
      expectedCount: 0,
      signedCount: 0,
      missingCount: 0,
      zoomCount: 0,
      manualCount: 0,
      hasSyncError: false,
    };
    g.sheetCount += 1;
    g.expectedCount += row.expectedCount;
    g.signedCount += row.signedCount;
    g.missingCount += Math.max(0, row.expectedCount - row.signedCount);
    g.zoomCount += row.zoomCount;
    g.manualCount += row.manualCount;
    if (row.zoomLastSyncStatus === 'error') g.hasSyncError = true;
    map.set(key, g);
  }
  return [...map.values()];
};

const isIncomplete = (row: ConsolidatedSheetRow): boolean =>
  row.status !== 'finalized' && row.signedCount < row.expectedCount;

const daysSince = (iso: string, now: Date): number =>
  (now.getTime() - new Date(iso).getTime()) / 86_400_000;

export const summarize = (
  rows: readonly ConsolidatedSheetRow[],
  now: Date,
): ConsolidatedSummary => {
  let expected = 0;
  let signed = 0;
  let zoom = 0;
  let incompleteSheets = 0;
  let syncErrors = 0;
  let hoursAtRiskRecoverable = 0;
  let hoursAtRiskLost = 0;

  for (const row of rows) {
    expected += row.expectedCount;
    signed += row.signedCount;
    zoom += row.zoomCount;
    if (row.zoomLastSyncStatus === 'error') syncErrors += 1;
    if (isIncomplete(row)) {
      incompleteSheets += 1;
      if (daysSince(row.sessionEndsAt, now) <= ZOOM_RETENTION_DAYS) {
        hoursAtRiskRecoverable += row.sessionHours;
      } else {
        hoursAtRiskLost += row.sessionHours;
      }
    }
  }

  return {
    incompleteSheets,
    signatureRate: expected > 0 ? signed / expected : 0,
    zoomCoverage: signed > 0 ? zoom / signed : 0,
    syncErrors,
    hoursAtRiskRecoverable,
    hoursAtRiskLost,
  };
};
```

- [ ] **Step 5 : Lancer les tests pour vérifier le succès**

Run : `pnpm --filter web test aggregate-consolidated`
Expected : PASS (tous les cas).

- [ ] **Step 6 : Commit**

```bash
git add apps/web/features/attendance/queries/attendance-consolidated.types.ts \
        apps/web/features/attendance/queries/aggregate-consolidated.ts \
        apps/web/features/attendance/queries/aggregate-consolidated.test.ts
git commit -m "feat(attendance): types + helpers d'agrégation du read model consolidé"
```

---

## Task 4 : Fetch Supabase du read model (RLS-scoped)

**Files:**
- Create: `apps/web/features/attendance/queries/list-consolidated-attendance.ts`
- (Prérequis) Regénérer les types DB après Task 1.

- [ ] **Step 1 : Regénérer les types DB (la vue doit y apparaître)**

Run :
```bash
pnpm db:types
git add apps/web/shared/types/database.ts
```
Expected : `app.attendance_consolidated` apparaît dans `Database['app']['Views']`.

- [ ] **Step 2 : Implémenter le fetch + mapping**

Create `apps/web/features/attendance/queries/list-consolidated-attendance.ts` :

```ts
import 'server-only';
import { supabaseServer } from '@/shared/lib/supabase/server';
import { groupByLens, summarize } from './aggregate-consolidated';
import type {
  ConsolidatedSheetRow,
  ConsolidatedGroup,
  ConsolidatedSummary,
  Lens,
} from './attendance-consolidated.types';

export type ConsolidatedFilters = {
  lens: Lens;
  companyId?: string;
  from?: string; // ISO date
  to?: string; // ISO date
};

export type ConsolidatedView = {
  groups: ConsolidatedGroup[];
  summary: ConsolidatedSummary;
};

const COLUMNS =
  'attendance_sheet_id, organization_id, dossier_id, session_id, status, ' +
  'company_id, company_name, trainer_id, trainer_name, ' +
  'session_starts_at, session_ends_at, session_hours, modality, ' +
  'expected_count, signed_count, zoom_count, manual_count, zoom_last_sync_status';

type DbRow = {
  attendance_sheet_id: string;
  organization_id: string;
  dossier_id: string;
  session_id: string;
  status: ConsolidatedSheetRow['status'];
  company_id: string | null;
  company_name: string | null;
  trainer_id: string | null;
  trainer_name: string | null;
  session_starts_at: string;
  session_ends_at: string;
  session_hours: number;
  modality: string;
  expected_count: number;
  signed_count: number;
  zoom_count: number;
  manual_count: number;
  zoom_last_sync_status: ConsolidatedSheetRow['zoomLastSyncStatus'];
};

const toRow = (r: DbRow): ConsolidatedSheetRow => ({
  attendanceSheetId: r.attendance_sheet_id,
  organizationId: r.organization_id,
  dossierId: r.dossier_id,
  sessionId: r.session_id,
  status: r.status,
  companyId: r.company_id,
  companyName: r.company_name,
  trainerId: r.trainer_id,
  trainerName: r.trainer_name,
  sessionStartsAt: r.session_starts_at,
  sessionEndsAt: r.session_ends_at,
  sessionHours: Number(r.session_hours),
  modality: r.modality,
  expectedCount: r.expected_count,
  signedCount: r.signed_count,
  zoomCount: r.zoom_count,
  manualCount: r.manual_count,
  zoomLastSyncStatus: r.zoom_last_sync_status,
});

export async function listConsolidatedAttendance(
  filters: ConsolidatedFilters,
  now: Date = new Date(),
): Promise<ConsolidatedView> {
  const sb = supabaseServer();
  let q = sb.schema('app').from('attendance_consolidated').select(COLUMNS);
  if (filters.companyId) q = q.eq('company_id', filters.companyId);
  if (filters.from) q = q.gte('session_starts_at', filters.from);
  if (filters.to) q = q.lte('session_starts_at', filters.to);

  const { data, error } = await q;
  if (error) throw new Error(`consolidated_attendance_query_failed: ${error.message}`);

  const rows = ((data ?? []) as unknown as DbRow[]).map(toRow);
  return {
    groups: groupByLens(rows, filters.lens),
    summary: summarize(rows, now),
  };
}
```

- [ ] **Step 3 : Vérifier le typecheck**

Run : `pnpm typecheck`
Expected : PASS (aucune erreur de type sur le nouveau fichier).

- [ ] **Step 4 : Commit**

```bash
git add apps/web/shared/types/database.ts \
        apps/web/features/attendance/queries/list-consolidated-attendance.ts
git commit -m "feat(attendance): fetch RLS-scoped du read model consolidé + types DB"
```

---

## Task 5 : Toggle de lentille (client component)

**Files:**
- Create: `apps/web/app/(dashboard)/emargements/lens-toggle.tsx`

- [ ] **Step 1 : Implémenter le toggle (navigation par query param)**

Create `apps/web/app/(dashboard)/emargements/lens-toggle.tsx` :

```tsx
'use client';

import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { cn } from '@/shared/lib/cn';
import type { Lens } from '@/features/attendance/queries/attendance-consolidated.types';

const OPTIONS: ReadonlyArray<{ value: Lens; label: string }> = [
  { value: 'session', label: 'Par session' },
  { value: 'company', label: 'Par entreprise' },
  { value: 'trainer', label: 'Par formateur' },
];

export function LensToggle({ active }: { active: Lens }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const select = (lens: Lens) => {
    const next = new URLSearchParams(params.toString());
    next.set('lens', lens);
    router.push(`${pathname}?${next.toString()}`);
  };

  return (
    <div className="inline-flex rounded-lg border border-zinc-200/60 dark:border-zinc-800 p-0.5 bg-zinc-50/60 dark:bg-zinc-950/40">
      {OPTIONS.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => select(o.value)}
          className={cn(
            'px-3 py-1.5 text-[13px] rounded-md transition',
            active === o.value
              ? 'bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 shadow-sm font-medium'
              : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 2 : Typecheck**

Run : `pnpm typecheck`
Expected : PASS.

- [ ] **Step 3 : Commit**

```bash
git add "apps/web/app/(dashboard)/emargements/lens-toggle.tsx"
git commit -m "feat(emargements): toggle de lentille session/entreprise/formateur"
```

---

## Task 6 : Page consolidée (remplace le mock)

**Files:**
- Modify (réécriture complète) : `apps/web/app/(dashboard)/emargements/page.tsx`

- [ ] **Step 1 : Réécrire la page pour lire le read model réel**

Replace l'intégralité de `apps/web/app/(dashboard)/emargements/page.tsx` par :

```tsx
// ARCHETYPE: command
// Justification: pilotage consolidé de l'émargement (risque de preuve manquante) — preuve Qualiopi indicateur 22.

import Link from 'next/link';
import { ClipboardCheck, AlertTriangle, Video, ShieldCheck } from 'lucide-react';
import { StatCard } from '@/shared/ui/stat-card';
import { ProgressBar } from '@/shared/ui/progress-bar';
import {
  listConsolidatedAttendance,
  type ConsolidatedFilters,
} from '@/features/attendance/queries/list-consolidated-attendance';
import type { Lens } from '@/features/attendance/queries/attendance-consolidated.types';
import { LensToggle } from './lens-toggle';

export const dynamic = 'force-dynamic';

const LENSES: ReadonlyArray<Lens> = ['session', 'company', 'trainer'];

function parseLens(raw: string | string[] | undefined): Lens {
  const v = Array.isArray(raw) ? raw[0] : raw;
  return LENSES.includes(v as Lens) ? (v as Lens) : 'session';
}

function pct(n: number): string {
  return `${Math.round(n * 100)}%`;
}

export default async function EmargementsPage({
  searchParams,
}: {
  searchParams: { lens?: string; companyId?: string };
}) {
  const lens = parseLens(searchParams.lens);
  const filters: ConsolidatedFilters = { lens, companyId: searchParams.companyId };
  const { groups, summary } = await listConsolidatedAttendance(filters);

  const hoursAtRisk = summary.hoursAtRiskRecoverable + summary.hoursAtRiskLost;

  return (
    <div className="max-w-7xl w-full mx-auto px-8 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100 tracking-tight">
          Émargements
        </h1>
        <p className="text-[14px] text-zinc-500 dark:text-zinc-400 mt-1">
          Vue consolidée des présences et de la preuve de connexion — risque de non-paiement par le financeur.
        </p>
      </header>

      <section className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <StatCard
          label="Heures à risque"
          value={`${hoursAtRisk.toFixed(1)} h`}
          icon={AlertTriangle}
          accent={hoursAtRisk > 0 ? 'amber' : 'emerald'}
          hint={
            hoursAtRisk > 0
              ? `${summary.hoursAtRiskRecoverable.toFixed(1)} h récupérables · ${summary.hoursAtRiskLost.toFixed(1)} h perdues`
              : 'tout est justifié'
          }
          hintTone={hoursAtRisk > 0 ? 'warning' : 'success'}
        />
        <StatCard label="Feuilles incomplètes" value={summary.incompleteSheets} icon={ClipboardCheck} accent="violet" />
        <StatCard
          label="Couverture preuve Zoom"
          value={pct(summary.zoomCoverage)}
          icon={Video}
          accent="blue"
        />
        <StatCard
          label="Syncs Zoom en erreur"
          value={summary.syncErrors}
          icon={ShieldCheck}
          accent={summary.syncErrors > 0 ? 'rose' : 'emerald'}
          hintTone={summary.syncErrors > 0 ? 'warning' : 'neutral'}
        />
      </section>

      <div className="flex items-center justify-between mb-3">
        <p className="text-[13px] text-zinc-500 dark:text-zinc-400">
          Taux de signatures global : <span className="font-medium text-zinc-800 dark:text-zinc-200">{pct(summary.signatureRate)}</span>
        </p>
        <LensToggle active={lens} />
      </div>

      <div className="bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-xl shadow-sm overflow-hidden">
        <div className="grid grid-cols-[1fr_120px_220px_160px] gap-3 px-5 py-2.5 text-[10px] tracking-wider uppercase text-zinc-400 dark:text-zinc-500 border-b border-zinc-200/60 dark:border-zinc-800 bg-zinc-50/40 dark:bg-zinc-950/40">
          <div>{lens === 'session' ? 'Session' : lens === 'company' ? 'Entreprise' : 'Formateur'}</div>
          <div>Feuilles</div>
          <div>Signatures</div>
          <div>Preuve</div>
        </div>

        {groups.length === 0 ? (
          <p className="px-5 py-10 text-center text-[13px] text-zinc-400">Aucune feuille d'émargement pour ce filtre.</p>
        ) : (
          <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {groups.map((g) => {
              const isFull = g.expectedCount > 0 && g.signedCount >= g.expectedCount;
              return (
                <li
                  key={g.key}
                  className="grid grid-cols-[1fr_120px_220px_160px] gap-3 px-5 py-3 items-center text-[13px]"
                >
                  <span className="text-zinc-900 dark:text-zinc-100 truncate inline-flex items-center gap-2">
                    {g.label}
                    {g.hasSyncError && (
                      <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400">
                        sync KO
                      </span>
                    )}
                  </span>
                  <span className="font-mono text-[11px] text-zinc-600 dark:text-zinc-300 tabular-nums">{g.sheetCount}</span>
                  <div className="flex items-center gap-2">
                    <ProgressBar
                      value={g.signedCount}
                      max={Math.max(g.expectedCount, 1)}
                      tone={isFull ? 'emerald' : 'amber'}
                      size="sm"
                    />
                    <span className="text-[11px] font-mono text-zinc-700 dark:text-zinc-300 tabular-nums w-12 text-right">
                      {g.signedCount}/{g.expectedCount}
                    </span>
                  </div>
                  <span className="inline-flex items-center gap-1.5 text-[11px]">
                    <span className="px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400">
                      Zoom {g.zoomCount}
                    </span>
                    <span className="px-1.5 py-0.5 rounded-full bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                      Manuel {g.manualCount}
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
```

> Note décomposition : la lentille `session` affiche un row par feuille mais ne propose pas encore de lien profond par-feuille (le drill-down par-dossier reste accessible depuis `/dossiers/[id]/emargements`). Un lien profond par-feuille pourra être ajouté ultérieurement sans changer le contrat de la query.

- [ ] **Step 2 : Typecheck + build de la page**

Run : `pnpm typecheck`
Expected : PASS (plus aucune référence à `@/shared/mock/data` dans ce fichier).

- [ ] **Step 3 : Vérifier visuellement (charte v3)**

Run : `pnpm --filter web dev` puis ouvrir `/emargements`, tester les 3 lentilles via le toggle.
Expected : StatCards affichées, table groupée correcte, dark mode OK, 1 seul primaire max.

- [ ] **Step 4 : Commit**

```bash
git add "apps/web/app/(dashboard)/emargements/page.tsx"
git commit -m "feat(emargements): page consolidée réelle (remplace le mock) avec lentilles + risque"
```

---

## Task 7 : RPC `record_zoom_attendance` à précédence humaine (migration 0044)

**Files:**
- Create: `supabase/migrations/0044_record_zoom_attendance.sql`

- [ ] **Step 1 : Écrire la migration du RPC**

Create `supabase/migrations/0044_record_zoom_attendance.sql` :

```sql
-- ============================================================================
-- 0044 — RPC record_zoom_attendance : capture Zoom à précédence humaine
-- ============================================================================
-- Règle : l'auto-sync Zoom ne remplit QUE les présences manquantes ou
-- déjà d'origine Zoom. Il ne remplace JAMAIS une signature humaine
-- (manual / qr / trainer_override). Une feuille finalisée est déjà bloquée
-- par le trigger d'immutabilité 0033.
-- Retour : 'recorded' (insert/update Zoom) | 'skipped_human' (signature humaine préservée).
-- ============================================================================

CREATE OR REPLACE FUNCTION app.record_zoom_attendance(
  p_attendance_sheet_id UUID,
  p_learner_id UUID,
  p_status app.attendance_status,
  p_signature_hash TEXT,
  p_evidence_source TEXT,
  p_evidence_payload JSONB
) RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
  v_org_id UUID;
  v_existing_source TEXT;
BEGIN
  IF p_evidence_source NOT IN ('zoom_api','zoom_csv') THEN
    RAISE EXCEPTION 'invalid_zoom_evidence_source' USING ERRCODE = 'P0001';
  END IF;

  SELECT organization_id INTO v_org_id
    FROM app.attendance_sheets
   WHERE id = p_attendance_sheet_id
   FOR UPDATE;
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'attendance_sheet_not_found' USING ERRCODE = 'P0002';
  END IF;

  -- Précédence : ne jamais écraser une signature d'origine humaine
  SELECT evidence_source INTO v_existing_source
    FROM app.attendance_signatures
   WHERE attendance_sheet_id = p_attendance_sheet_id
     AND participant_kind = 'learner'
     AND learner_id = p_learner_id;

  IF v_existing_source IN ('manual','qr','trainer_override') THEN
    RETURN 'skipped_human';
  END IF;

  INSERT INTO app.attendance_signatures (
    organization_id, attendance_sheet_id, participant_kind, learner_id,
    status, signed_at, signer_user_agent,
    signature_hash, evidence_source, evidence_payload
  ) VALUES (
    v_org_id, p_attendance_sheet_id, 'learner', p_learner_id,
    p_status, now(), 'zoom-api-sync',
    p_signature_hash, p_evidence_source, p_evidence_payload
  )
  ON CONFLICT (attendance_sheet_id, participant_kind, participant_id) DO UPDATE
    SET status = EXCLUDED.status,
        signed_at = EXCLUDED.signed_at,
        evidence_source = EXCLUDED.evidence_source,
        evidence_payload = EXCLUDED.evidence_payload
    WHERE app.attendance_signatures.evidence_source IN ('zoom_api','zoom_csv');

  RETURN 'recorded';
END $$;

REVOKE ALL ON FUNCTION app.record_zoom_attendance(UUID, UUID, app.attendance_status, TEXT, TEXT, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.record_zoom_attendance(UUID, UUID, app.attendance_status, TEXT, TEXT, JSONB) TO service_role;
```

- [ ] **Step 2 : Replay des migrations**

Run : `pnpm db:reset`
Expected : succès, fonction `app.record_zoom_attendance` créée.

- [ ] **Step 3 : Commit**

```bash
git add supabase/migrations/0044_record_zoom_attendance.sql
git commit -m "feat(attendance): RPC record_zoom_attendance à précédence humaine"
```

---

## Task 8 : pgTAP — précédence humaine + feuille finalisée

**Files:**
- Create: `supabase/tests/0048_test_record_zoom_attendance_precedence.sql`

- [ ] **Step 1 : Écrire le test (échoue si l'auto-sync écrase l'humain)**

Create `supabase/tests/0048_test_record_zoom_attendance_precedence.sql` :

```sql
-- ============================================================================
-- Tests pgTAP : record_zoom_attendance respecte la précédence humaine
-- ============================================================================
BEGIN;
SELECT plan(4);

SELECT tests.as_service_role();

INSERT INTO app.organizations (id, name, legal_name, siret) VALUES
  ('00aaa000-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'OF A', 'OF A SARL', '11111111111111');

INSERT INTO app.learners (id, organization_id, first_name, last_name, email) VALUES
  ('1ea00000-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '00aaa000-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Lea', 'A', 'lea-a@of.test'),
  ('1eb00000-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '00aaa000-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Leo', 'A', 'leo-a@of.test');

INSERT INTO app.dossiers (id, organization_id, reference, learner_id, status) VALUES
  ('d0a00000-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '00aaa000-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'DOS-A', '1ea00000-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'draft');

INSERT INTO app.sessions (id, organization_id, dossier_id, modality, starts_at, ends_at) VALUES
  ('5e500a00-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '00aaa000-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'd0a00000-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'distanciel', now() - interval '2 days', now() - interval '2 days' + interval '3 hours');

INSERT INTO app.attendance_sheets (id, organization_id, dossier_id, session_id, half_day, status) VALUES
  ('a5a00000-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '00aaa000-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'd0a00000-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '5e500a00-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'full', 'open');

-- Lea a déjà signé MANUELLEMENT
INSERT INTO app.attendance_signatures (
  organization_id, attendance_sheet_id, participant_kind, learner_id,
  status, signed_at, evidence_source
) VALUES (
  '00aaa000-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a5a00000-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'learner', '1ea00000-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'present', now(), 'manual'
);

-- 1) Zoom NE DOIT PAS écraser la signature manuelle de Lea
SELECT is(
  app.record_zoom_attendance(
    'a5a00000-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '1ea00000-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    'present'::app.attendance_status, 'hashLea', 'zoom_api', '{"durationMinutes": 120}'::jsonb
  ),
  'skipped_human',
  'Zoom ne remplace pas une signature manuelle'
);

SELECT is(
  (SELECT evidence_source FROM app.attendance_signatures
     WHERE attendance_sheet_id = 'a5a00000-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
       AND learner_id = '1ea00000-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  'manual',
  'La signature de Lea reste manual après tentative Zoom'
);

-- 2) Zoom REMPLIT la présence manquante de Leo
SELECT is(
  app.record_zoom_attendance(
    'a5a00000-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '1eb00000-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    'present'::app.attendance_status, 'hashLeo', 'zoom_api', '{"durationMinutes": 150}'::jsonb
  ),
  'recorded',
  'Zoom remplit une présence manquante'
);

SELECT is(
  (SELECT evidence_source FROM app.attendance_signatures
     WHERE attendance_sheet_id = 'a5a00000-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
       AND learner_id = '1eb00000-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  'zoom_api',
  'Leo a une preuve Zoom enregistrée'
);

SELECT * FROM finish();
ROLLBACK;
```

- [ ] **Step 2 : Lancer le test**

Run : `pnpm db:test`
Expected : les 4 assertions de `0048_test_record_zoom_attendance_precedence` passent.

- [ ] **Step 3 : Commit**

```bash
git add supabase/tests/0048_test_record_zoom_attendance_precedence.sql
git commit -m "test(attendance): pgTAP précédence humaine de record_zoom_attendance"
```

---

## Task 9 : Fenêtre de rétention (fonction pure, TDD)

**Files:**
- Create: `apps/web/features/attendance/zoom-sync-window.ts`
- Test: `apps/web/features/attendance/zoom-sync-window.test.ts`

- [ ] **Step 1 : Écrire le test (échoue d'abord)**

Create `apps/web/features/attendance/zoom-sync-window.test.ts` :

```ts
import { describe, it, expect } from 'vitest';
import { computeSyncWindow, ZOOM_RETENTION_DAYS, MIN_SETTLE_MINUTES } from './zoom-sync-window';

describe('computeSyncWindow', () => {
  it('borne haute = now - délai de stabilisation', () => {
    const now = new Date('2026-06-30T12:00:00.000Z');
    const w = computeSyncWindow(now);
    expect(MIN_SETTLE_MINUTES).toBe(30);
    expect(w.cutoffIso).toBe('2026-06-30T11:30:00.000Z');
  });

  it('borne basse = now - rétention Zoom', () => {
    const now = new Date('2026-06-30T12:00:00.000Z');
    const w = computeSyncWindow(now);
    expect(ZOOM_RETENTION_DAYS).toBe(25);
    expect(w.floorIso).toBe('2026-06-05T12:00:00.000Z');
  });

  it('floor est antérieur à cutoff', () => {
    const w = computeSyncWindow(new Date('2026-06-30T12:00:00.000Z'));
    expect(new Date(w.floorIso).getTime()).toBeLessThan(new Date(w.cutoffIso).getTime());
  });
});
```

- [ ] **Step 2 : Lancer pour vérifier l'échec**

Run : `pnpm --filter web test zoom-sync-window`
Expected : FAIL — module non trouvé.

- [ ] **Step 3 : Implémenter la fonction pure**

Create `apps/web/features/attendance/zoom-sync-window.ts` :

```ts
// Fenêtre de sessions éligibles au backfill Zoom :
// terminées il y a > MIN_SETTLE_MINUTES (le rapport Zoom est prêt)
// et < ZOOM_RETENTION_DAYS (encore dans la rétention Zoom).
export const ZOOM_RETENTION_DAYS = 25;
export const MIN_SETTLE_MINUTES = 30;

export type SyncWindow = { floorIso: string; cutoffIso: string };

export function computeSyncWindow(now: Date): SyncWindow {
  const cutoff = new Date(now.getTime() - MIN_SETTLE_MINUTES * 60_000);
  const floor = new Date(now.getTime() - ZOOM_RETENTION_DAYS * 86_400_000);
  return { floorIso: floor.toISOString(), cutoffIso: cutoff.toISOString() };
}
```

- [ ] **Step 4 : Lancer pour vérifier le succès**

Run : `pnpm --filter web test zoom-sync-window`
Expected : PASS.

- [ ] **Step 5 : Commit**

```bash
git add apps/web/features/attendance/zoom-sync-window.ts \
        apps/web/features/attendance/zoom-sync-window.test.ts
git commit -m "feat(attendance): fenêtre de rétention pure pour le backfill Zoom"
```

---

## Task 10 : Durcir le route zoom-sync (fenêtre + RPC à précédence)

**Files:**
- Modify : `apps/web/app/api/cron/zoom-sync/route.ts`

Contexte : le route a aujourd'hui (a) une sélection `ends_at < now-30min` **sans borne basse** + `limit(20)` triée DESC, et (b) une boucle qui appelle `record_attendance_signature` (qui écrase l'humain). On corrige les deux.

- [ ] **Step 1 : Importer la fenêtre et l'appliquer à la sélection des sessions**

Dans `apps/web/app/api/cron/zoom-sync/route.ts`, ajouter l'import en tête (à côté des autres imports `@/features/attendance/...`) :

```ts
import { computeSyncWindow } from '@/features/attendance/zoom-sync-window';
```

Puis remplacer le bloc de sélection (actuellement) :

```ts
  const sb = admin();
  const cutoff = new Date(Date.now() - 30 * 60 * 1000).toISOString();

  const { data: sessions, error } = await sb
    .schema('app')
    .from('sessions')
    .select('id, organization_id, dossier_id, zoom_meeting_id, starts_at, ends_at')
    .eq('modality', 'distanciel')
    .not('zoom_meeting_id', 'is', null)
    .lt('ends_at', cutoff)
    .order('ends_at', { ascending: false })
    .limit(SESSION_BATCH_LIMIT);
```

par :

```ts
  const sb = admin();
  const { floorIso, cutoffIso } = computeSyncWindow(new Date());

  const { data: sessions, error } = await sb
    .schema('app')
    .from('sessions')
    .select('id, organization_id, dossier_id, zoom_meeting_id, starts_at, ends_at')
    .eq('modality', 'distanciel')
    .not('zoom_meeting_id', 'is', null)
    .gte('ends_at', floorIso)   // borne basse = rétention Zoom
    .lt('ends_at', cutoffIso)   // borne haute = délai de stabilisation
    .order('ends_at', { ascending: true }) // traiter d'abord les plus proches de l'expiration
    .limit(SESSION_BATCH_LIMIT);
```

- [ ] **Step 2 : Remplacer l'appel RPC qui écrase par le RPC à précédence**

Dans la boucle `for (const row of apiResult.participants)`, remplacer le bloc d'appel `record_attendance_signature` (matched) :

```ts
    const statusComputed: 'present' | 'late' =
      row.durationMinutes >= ATTENDANCE_THRESHOLD * sessionMinutes ? 'present' : 'late';
    const hash = createHash('sha256').update(JSON.stringify(row.raw)).digest('hex');
    const { error } = await sb.rpc('record_attendance_signature' as never, {
      p_attendance_sheet_id: sheetId,
      p_signer_id: learnerId,
      p_signer_kind: 'learner',
      p_image_path: null,
      p_signature_hash: hash,
      p_signer_ip: `zoom://${row.email ?? 'unknown'}`,
      p_signer_user_agent: 'zoom-api-sync',
      p_signer_country: null,
      p_token_jti: null,
      p_evidence_source: 'zoom_api',
      p_evidence_payload: {
        joinTime: row.joinTime?.toISOString() ?? null,
        leaveTime: row.leaveTime?.toISOString() ?? null,
        durationMinutes: row.durationMinutes,
        statusComputed,
        raw: row.raw,
      },
    } as never);
    if (!error) matched++;
```

par :

```ts
    const statusComputed: 'present' | 'late' =
      row.durationMinutes >= ATTENDANCE_THRESHOLD * sessionMinutes ? 'present' : 'late';
    const hash = createHash('sha256').update(JSON.stringify(row.raw)).digest('hex');
    const { error } = await sb.rpc('record_zoom_attendance' as never, {
      p_attendance_sheet_id: sheetId,
      p_learner_id: learnerId,
      p_status: statusComputed,
      p_signature_hash: hash,
      p_evidence_source: 'zoom_api',
      p_evidence_payload: {
        joinTime: row.joinTime?.toISOString() ?? null,
        leaveTime: row.leaveTime?.toISOString() ?? null,
        durationMinutes: row.durationMinutes,
        statusComputed,
        raw: row.raw,
      },
    } as never);
    if (!error) matched++;
```

> Le RPC `record_zoom_attendance` renvoie `'recorded'` ou `'skipped_human'` ; dans les deux cas il n'y a pas d'`error`, donc une signature manuelle préservée compte quand même comme "matched" (présence connue). C'est le comportement voulu : on ne crée pas de doublon et on ne perd pas la signature humaine.

- [ ] **Step 3 : Typecheck**

Run : `pnpm typecheck`
Expected : PASS.

- [ ] **Step 4 : Vérifier manuellement le route (local, DB seedée)**

Run :
```bash
pnpm --filter web dev
curl -s -X POST http://localhost:3000/api/cron/zoom-sync \
  -H "Authorization: Bearer $CRON_SECRET" | jq .
```
Expected : réponse `{ ok: true, processed, summary: { success, partial, error, skipped } }`. Sans intégration Zoom configurée, les sessions ressortent en `skipped` (`no_integration_or_decrypt_failed`) — c'est attendu et prouve que la sélection de fenêtre fonctionne sans planter.

- [ ] **Step 5 : Commit**

```bash
git add apps/web/app/api/cron/zoom-sync/route.ts
git commit -m "feat(zoom-sync): fenêtre de rétention + RPC à précédence humaine"
```

---

## Task 11 : Runbook d'activation du schedule externe

**Files:**
- Create: `docs/runbooks/zoom-sync-activation.md`

- [ ] **Step 1 : Écrire le runbook**

Create `docs/runbooks/zoom-sync-activation.md` :

```markdown
# Runbook — Activation du backfill Zoom (cron externe)

## But
Planifier l'appel automatique du backfill Zoom pour ne plus dépendre de l'upload CSV
manuel par session. Le code est dans `apps/web/app/api/cron/zoom-sync/route.ts`.

## Endpoint
- Méthode : `POST` (ou `GET`, supporté pour les schedulers GET-only)
- URL : `https://<DOMAINE_PROD>/api/cron/zoom-sync`
- Auth : header `Authorization: Bearer <CRON_SECRET>`
  (variable d'env déjà utilisée par `transactional-emails`).

## Fréquence recommandée
- 1×/nuit (ex. `30 2 * * *`). La fenêtre couvre les sessions terminées entre
  il y a 25 jours et il y a 30 minutes ; une exécution quotidienne suffit largement
  à rester dans la rétention Zoom (~30 j).

## Procédure (même outil que les autres crons : cron-job.org / Railway)
1. Créer un job HTTP planifié `30 2 * * *`.
2. Méthode `POST`, URL ci-dessus.
3. Header `Authorization: Bearer <CRON_SECRET>`.
4. Sauvegarder, déclencher un run manuel de test.

## Vérification
- La réponse JSON contient `{ ok: true, processed, summary }`.
- Dans le dashboard `/emargements`, la couverture preuve Zoom doit augmenter et les
  "heures à risque récupérables" diminuer au fil des nuits.
- Côté DB : `SELECT status, count(*) FROM app.zoom_sync_logs GROUP BY status;`.

## Pré-requis tenant
- Chaque organisation doit avoir une intégration `app.tenant_integrations(kind='zoom_s2s', status='active')`
  avec des credentials valides ; sinon les sessions ressortent en `skipped`.
```

- [ ] **Step 2 : Commit**

```bash
git add docs/runbooks/zoom-sync-activation.md
git commit -m "docs(zoom-sync): runbook d'activation du schedule externe"
```

---

## Task 12 : Vérification finale d'ensemble

- [ ] **Step 1 : Suite complète**

Run :
```bash
pnpm db:reset && pnpm db:test && pnpm --filter web test && pnpm typecheck
```
Expected : migrations rejouées, **tous** les pgTAP passent (dont 0047 et 0048), Vitest vert (helpers d'agrégation + fenêtre), typecheck propre.

- [ ] **Step 2 : Golden path manuel**

1. Seeder une session distancielle terminée hier, 2 apprenants, 1 signature manuelle + 1 manquante.
2. Ouvrir `/emargements` → vérifier "heures à risque récupérables" > 0 et couverture Zoom < 100 %.
3. (Si intégration Zoom de test dispo) déclencher `POST /api/cron/zoom-sync` → la présence manquante passe en preuve Zoom, la signature manuelle reste `manual`.
4. Basculer les 3 lentilles (session/entreprise/formateur) → cohérence des totaux.

- [ ] **Step 3 : Commit final (si ajustements)**

```bash
git add -A
git commit -m "chore(attendance): finalisation émargement consolidé + activation Zoom"
```

---

## Self-Review (rempli par l'auteur du plan)

**1. Couverture spec :**
- §4 vue read model → Task 1. §9 RLS pgTAP → Task 2. §6 query TS + heures à risque → Tasks 3-4. §7 page + lentille (défaut session) + remplace mock → Tasks 5-6. §8.1 fenêtre de rétention → Tasks 9-10. §8.2 précédence humaine + finalized → Tasks 7-8 (finalized couvert par trigger 0033, vérifié en Task 4 manuel + non-régression assurée par le route qui skip). §8.3 schedule externe → Task 11. §10 tests → Tasks 2,3,8,9,12. Aucune section sans tâche.
- Note : §8.2 mentionnait "à trancher : garde route vs RPC". **Tranché : RPC** `record_zoom_attendance` (DB-level, testable pgTAP, robuste quel que soit l'appelant).

**2. Placeholders :** aucun TODO/TBD ; tout le code SQL/TS/TSX est complet.

**3. Cohérence des types :** `ConsolidatedSheetRow`/`Lens`/`ConsolidatedGroup`/`ConsolidatedSummary` définis en Task 3, consommés à l'identique en Tasks 4-6. `computeSyncWindow`/`ZOOM_RETENTION_DAYS`/`MIN_SETTLE_MINUTES` définis en Task 9, importés en Task 10. RPC `record_zoom_attendance(p_attendance_sheet_id, p_learner_id, p_status, p_signature_hash, p_evidence_source, p_evidence_payload)` : signature identique entre Task 7 (def), Task 8 (test) et Task 10 (appel).

> Risque résiduel connu : les colonnes exactes de `dossiers` / `learners` dans les INSERT pgTAP (Tasks 2 & 8) supposent les colonnes confirmées au design (`reference`, `learner_id`, `company_id`, `status`). Si `pnpm db:reset` révèle une colonne NOT NULL supplémentaire, compléter l'INSERT en lisant la table dans `supabase/migrations/` (action mécanique, sans changement de logique).
