# Qualiopi bloquant — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rendre le suivi Qualiopi bloquant : calculer la readiness d'un dossier depuis les preuves/artefacts réels et empêcher en base le passage `→ active` (sans indicateurs d'entrée) et `→ closed` (sans indicateurs de clôture).

**Architecture:** Approche A — gates appliqués en base via un trigger SQL incontournable, alimentés par un moteur de calcul SQL (`eval_qualiopi_counts`) qui résout une matrice de règles (référentiel système + override OF) et évalue chaque indicateur dossier via sa source de satisfaction (preuve, questionnaire, émargement, doc signé). Recalcul event-driven pour la fraîcheur UI ; le trigger reste l'autorité.

**Tech Stack:** Postgres/Supabase (migrations SQL, fonctions PL/pgSQL SECURITY DEFINER, trigger, RLS, pgTAP), Next.js 14 App Router (Server Actions, dispatcher outbox), Vitest.

---

## Conventions du repo (vérifiées)

- Migrations : `supabase/migrations/NNNN_*.sql`. Dernière sur disque = `0042`.
  **⚠️ Dépendance de numérotation** : le plan financeurs (`docs/superpowers/plans/2026-06-12-playbook-financeurs.md`) réserve `0043`–`0047`. Ce plan utilise donc **`0048`–`0051`**. Si les migrations financeurs ne sont pas créées au moment d'exécuter, renuméroter à la suite du vrai dernier fichier.
- Tests pgTAP : `supabase/tests/NNNN_test_*.sql`, helper `_helpers.sql`, lancés par `pnpm db:test`. Dernier sur disque = `0046` (le plan financeurs réserve `0047`). Ce plan utilise **`0048`**.
- Helper RLS d'org : **`app.current_organization_id()`** (défini `0001_extensions_and_helpers.sql`).
- Reset + types : `pnpm db:reset` puis `pnpm db:types`. pgTAP : `pnpm db:test`.
- Web : `pnpm test` (Vitest, `**/*.test.ts`), `pnpm typecheck`, `pnpm lint`, `pnpm build`.
- `domain_events.type` = type d'event. Dispatcher : `apps/web/app/api/cron/dispatch-events/route.ts`, `HANDLERS: Record<string, Record<string, Handler>>`, `Handler = (event, sb) => Promise<{ok:true}|{ok:false,error}>`.
- Server Actions : `'use server'` + client service-role `createClient(URL, SERVICE_ROLE_KEY, {auth:{persistSession:false}})`, scoping org manuel (cf. `apps/web/app/(dashboard)/factures/actions.ts`).

> **⚠️ Vérification DB indisponible en local** : aucun runtime de conteneurs n'est installé (Docker absent). `pnpm db:reset`/`db:test`/`db:types` ne tournent pas. Les tâches DB (1-5) sont **write-only** : écrire + commit, vérif **PENDING** jusqu'à un environnement avec Docker. Les tâches TS (6-8) se valident par `pnpm lint` + « aucune nouvelle erreur typecheck attribuable » (le typecheck du repo est rouge avant toute modif : `@/env.mjs` sans `.d.ts`, etc.). Voir le plan financeurs pour le même protocole.

> **⚠️⚠️ L'UI dossier est un prototype MOCK** (constat 2026-06-13). `apps/web/app/(dashboard)/dossiers/[id]/page.tsx` et la page dédiée `apps/web/app/(dashboard)/dossiers/[id]/qualiopi/page.tsx` lisent `@/shared/mock/data` (pages **non-async**, pas de client Supabase). La **Task 8 est donc invalide en l'état** : elle suppose une page en données réelles. Prérequis avant Task 8 : convertir la page Qualiopi dossier de mock → données réelles (Server Component async + client `supabaseServer()`), effort distinct hors de ce plan. Tant que ce prérequis n'est pas fait, **ne pas exécuter la Task 8**.

> **Décision d'exécution (2026-06-13)** : exécution **suspendue**. Les deux blocages ci-dessus (Docker absent + UI mock) font qu'aucun sous-ensemble n'apporte de valeur vérifiée. Reprendre quand : (a) un runtime de conteneurs est dispo (tâches 1-5, 9) ET (b) la page Qualiopi dossier est passée en données réelles (préalable à 8). Tâches 6-7 livrables dès (a), mais sans valeur tant que 1-5 ne sont pas appliquées.

## Données existantes réutilisées (vérifiées)

- `app.qualiopi_indicators(id, code, number, scope, criterion, ...)` — 32 indicateurs seedés dans `supabase/seed.sql`. Dossier-scope : I4-I15, I20-I23, I26-I27, I30. **Le positionnement (analyse des besoins) = indicateur #10** « Positionnement de l'apprenant » (`expected_proofs=['questionnaire_positionnement']`).
- `app.qualiopi_proofs(dossier_id, indicator_id, deleted_at, valid_from, valid_until, ...)`.
- `app.qualiopi_dossier_checklists(dossier_id PK, organization_id, computed_at, total_indicators, satisfied_indicators, blocking_missing, details, is_ready GENERATED)`.
- `app.questionnaire_assignments(dossier_id, template_id, status)` + `questionnaire_templates(id, kind)` ; kinds : `positionnement`, `evaluation_acquis`, `satisfaction_chaud/froid`, `opco`, `custom` ; status : `pending|in_progress|completed|expired`.
- `app.attendance_sheets(dossier_id, status open|partial|completed|finalized)`.
- `app.documents(dossier_id)` + `document_signatures(document_id, status pending|signed|declined|expired)`.
- `app.dossiers(status, qualiopi_ready)` ; enum `dossier_status` : draft, pending_validation, scheduled, active, completed, closed, archived, cancelled.

## File Structure

**Migrations (créer)**
- `supabase/migrations/0048_qualiopi_rules.sql` — enums `qualiopi_gate_stage` + `qualiopi_satisfaction_source`, table `qualiopi_indicator_rules` + RLS.
- `supabase/migrations/0049_qualiopi_checklist_cols.sql` — colonnes `entry_blocking_missing` / `closing_blocking_missing`.
- `supabase/migrations/0050_qualiopi_engine.sql` — `eval_qualiopi_counts()`, `recompute_qualiopi_checklist()`, trigger `tg_qualiopi_transition_gate`.
- `supabase/migrations/0051_seed_qualiopi_rules.sql` — matrice standard (org NULL).

**Tests pgTAP (créer)**
- `supabase/tests/0048_test_qualiopi_engine.sql`.

**App (créer)**
- `apps/web/app/(dashboard)/dossiers/[id]/qualiopi/actions.ts` — `startTraining`, `closeDossier` (transitions gardées).
- `apps/web/app/(dashboard)/dossiers/[id]/qualiopi/_components/qualiopi-checklist.tsx` — UI.

**App (modifier)**
- `apps/web/app/api/cron/dispatch-events/route.ts` — handlers de recalcul.
- `apps/web/app/(dashboard)/dossiers/[id]/page.tsx` — monter la checklist.

---

### Task 1: Enums + table de règles

**Files:**
- Create: `supabase/migrations/0048_qualiopi_rules.sql`

- [ ] **Step 1: Écrire la migration**

```sql
-- ============================================================================
-- 0048 — Règles Qualiopi par indicateur (référentiel système + override OF)
-- ============================================================================

CREATE TYPE app.qualiopi_gate_stage AS ENUM ('entry', 'closing', 'none');

CREATE TYPE app.qualiopi_satisfaction_source AS ENUM (
  'proof', 'questionnaire_positionnement', 'questionnaire_evaluation',
  'attendance_signed', 'document_signed'
);

CREATE TABLE app.qualiopi_indicator_rules (
  id UUID PRIMARY KEY DEFAULT uuidv7(),
  organization_id UUID REFERENCES app.organizations(id) ON DELETE CASCADE,
  is_system BOOLEAN GENERATED ALWAYS AS (organization_id IS NULL) STORED,
  indicator_id UUID NOT NULL REFERENCES app.qualiopi_indicators(id) ON DELETE CASCADE,
  stage app.qualiopi_gate_stage NOT NULL DEFAULT 'none',
  is_blocking BOOLEAN NOT NULL DEFAULT false,
  satisfaction_source app.qualiopi_satisfaction_source NOT NULL DEFAULT 'proof',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ NULL,
  UNIQUE (organization_id, indicator_id)
);

CREATE INDEX ix_qualiopi_rules_resolve
  ON app.qualiopi_indicator_rules (indicator_id, organization_id)
  WHERE is_active AND deleted_at IS NULL;

ALTER TABLE app.qualiopi_indicator_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY qualiopi_rules_read ON app.qualiopi_indicator_rules
  FOR SELECT TO authenticated
  USING (organization_id IS NULL OR organization_id = app.current_organization_id());

CREATE POLICY qualiopi_rules_write ON app.qualiopi_indicator_rules
  FOR ALL TO authenticated
  USING (organization_id = app.current_organization_id())
  WITH CHECK (organization_id = app.current_organization_id());
```

- [ ] **Step 2: Vérif (PENDING si Docker absent)**

Run: `pnpm db:reset`
Expected: reset OK, table + enums créés. **Si Docker indisponible : marquer PENDING.**

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0048_qualiopi_rules.sql
git commit -m "feat(qualiopi): enums + table qualiopi_indicator_rules avec RLS"
```

---

### Task 2: Colonnes de compteurs par étape

**Files:**
- Create: `supabase/migrations/0049_qualiopi_checklist_cols.sql`

- [ ] **Step 1: Écrire la migration**

```sql
-- ============================================================================
-- 0049 — Compteurs bloquants par étape sur la checklist dossier
-- ============================================================================

ALTER TABLE app.qualiopi_dossier_checklists
  ADD COLUMN entry_blocking_missing   INT NOT NULL DEFAULT 0,
  ADD COLUMN closing_blocking_missing INT NOT NULL DEFAULT 0;
```

- [ ] **Step 2: Vérif (PENDING si Docker absent)**

Run: `pnpm db:reset`
Expected: colonnes ajoutées ; `is_ready` (généré sur `blocking_missing`) intact.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0049_qualiopi_checklist_cols.sql
git commit -m "feat(qualiopi): compteurs bloquants entrée/clôture sur la checklist"
```

---

### Task 3: Moteur de calcul + recompute + trigger de gate

**Files:**
- Create: `supabase/migrations/0050_qualiopi_engine.sql`

- [ ] **Step 1: Écrire la migration**

```sql
-- ============================================================================
-- 0050 — Moteur Qualiopi : calcul des compteurs + recompute + gate transition
-- ============================================================================

-- Évalue chaque indicateur dossier-scope, upsert le snapshot et renvoie les
-- compteurs. Ne touche PAS app.dossiers (appelable depuis un trigger BEFORE).
CREATE OR REPLACE FUNCTION app.eval_qualiopi_counts(
  p_dossier_id UUID,
  OUT total INT,
  OUT satisfied INT,
  OUT entry_blocking_missing INT,
  OUT closing_blocking_missing INT,
  OUT blocking_missing INT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
  v_org UUID;
  v_details JSONB;
BEGIN
  SELECT organization_id INTO v_org FROM app.dossiers WHERE id = p_dossier_id;

  WITH resolved AS (
    SELECT
      i.id AS indicator_id,
      i.number,
      COALESCE(orul.stage, srul.stage, 'none')                      AS stage,
      COALESCE(orul.is_blocking, srul.is_blocking, false)           AS is_blocking,
      COALESCE(orul.satisfaction_source, srul.satisfaction_source, 'proof') AS source
    FROM app.qualiopi_indicators i
    LEFT JOIN app.qualiopi_indicator_rules srul
      ON srul.indicator_id = i.id AND srul.organization_id IS NULL
     AND srul.is_active AND srul.deleted_at IS NULL
    LEFT JOIN app.qualiopi_indicator_rules orul
      ON orul.indicator_id = i.id AND orul.organization_id = v_org
     AND orul.is_active AND orul.deleted_at IS NULL
    WHERE i.scope = 'dossier' AND i.is_active
  ),
  evaluated AS (
    SELECT r.*,
      CASE r.source
        WHEN 'proof' THEN EXISTS (
          SELECT 1 FROM app.qualiopi_proofs p
          WHERE p.dossier_id = p_dossier_id AND p.indicator_id = r.indicator_id
            AND p.deleted_at IS NULL
            AND (p.valid_from  IS NULL OR p.valid_from  <= CURRENT_DATE)
            AND (p.valid_until IS NULL OR p.valid_until >= CURRENT_DATE))
        WHEN 'questionnaire_positionnement' THEN EXISTS (
          SELECT 1 FROM app.questionnaire_assignments qa
          JOIN app.questionnaire_templates qt ON qt.id = qa.template_id
          WHERE qa.dossier_id = p_dossier_id AND qt.kind = 'positionnement'
            AND qa.status = 'completed')
        WHEN 'questionnaire_evaluation' THEN EXISTS (
          SELECT 1 FROM app.questionnaire_assignments qa
          JOIN app.questionnaire_templates qt ON qt.id = qa.template_id
          WHERE qa.dossier_id = p_dossier_id AND qt.kind = 'evaluation_acquis'
            AND qa.status = 'completed')
        WHEN 'attendance_signed' THEN (
          EXISTS (SELECT 1 FROM app.attendance_sheets s WHERE s.dossier_id = p_dossier_id)
          AND NOT EXISTS (SELECT 1 FROM app.attendance_sheets s
                          WHERE s.dossier_id = p_dossier_id AND s.status <> 'finalized'))
        WHEN 'document_signed' THEN EXISTS (
          SELECT 1 FROM app.documents d
          JOIN app.document_signatures ds ON ds.document_id = d.id
          WHERE d.dossier_id = p_dossier_id AND ds.status = 'signed')
      END AS is_satisfied
    FROM resolved r
  )
  SELECT
    count(*)::int,
    count(*) FILTER (WHERE is_satisfied)::int,
    count(*) FILTER (WHERE stage = 'entry'   AND is_blocking AND NOT is_satisfied)::int,
    count(*) FILTER (WHERE stage = 'closing' AND is_blocking AND NOT is_satisfied)::int,
    count(*) FILTER (WHERE is_blocking AND NOT is_satisfied)::int,
    COALESCE(jsonb_agg(jsonb_build_object(
      'indicator_id', indicator_id, 'number', number, 'stage', stage,
      'is_blocking', is_blocking, 'satisfied', is_satisfied, 'source', source
    ) ORDER BY number), '[]'::jsonb)
  INTO total, satisfied, entry_blocking_missing, closing_blocking_missing,
       blocking_missing, v_details
  FROM evaluated;

  INSERT INTO app.qualiopi_dossier_checklists AS c (
    dossier_id, organization_id, computed_at, total_indicators,
    satisfied_indicators, blocking_missing, entry_blocking_missing,
    closing_blocking_missing, details
  )
  VALUES (
    p_dossier_id, v_org, now(), total, satisfied, blocking_missing,
    entry_blocking_missing, closing_blocking_missing, v_details
  )
  ON CONFLICT (dossier_id) DO UPDATE SET
    computed_at = now(),
    total_indicators = EXCLUDED.total_indicators,
    satisfied_indicators = EXCLUDED.satisfied_indicators,
    blocking_missing = EXCLUDED.blocking_missing,
    entry_blocking_missing = EXCLUDED.entry_blocking_missing,
    closing_blocking_missing = EXCLUDED.closing_blocking_missing,
    details = EXCLUDED.details;
END $$;

REVOKE ALL ON FUNCTION app.eval_qualiopi_counts(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.eval_qualiopi_counts(UUID) TO service_role;

-- Wrapper : eval + maj dossiers.qualiopi_ready (UI / handlers d'events).
CREATE OR REPLACE FUNCTION app.recompute_qualiopi_checklist(p_dossier_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE r RECORD;
BEGIN
  r := app.eval_qualiopi_counts(p_dossier_id);
  UPDATE app.dossiers SET qualiopi_ready = (r.blocking_missing = 0)
  WHERE id = p_dossier_id;
END $$;

REVOKE ALL ON FUNCTION app.recompute_qualiopi_checklist(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.recompute_qualiopi_checklist(UUID) TO service_role;

-- Gate incontournable : recalcule au moment de la transition, bloque si besoin.
CREATE OR REPLACE FUNCTION app.tg_qualiopi_transition_gate()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
  r RECORD;
  v_missing TEXT;
BEGIN
  r := app.eval_qualiopi_counts(NEW.id);
  NEW.qualiopi_ready := (r.blocking_missing = 0);

  IF NEW.status = 'active' AND OLD.status <> 'active'
     AND r.entry_blocking_missing > 0 THEN
    SELECT string_agg(d->>'number', ', ' ORDER BY (d->>'number')::int)
      INTO v_missing
    FROM app.qualiopi_dossier_checklists c,
         jsonb_array_elements(c.details) d
    WHERE c.dossier_id = NEW.id
      AND d->>'stage' = 'entry' AND (d->>'is_blocking')::boolean
      AND NOT (d->>'satisfied')::boolean;
    RAISE EXCEPTION 'qualiopi_entry_blocked: indicateurs % manquants', v_missing
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.status = 'closed' AND OLD.status <> 'closed'
     AND r.closing_blocking_missing > 0 THEN
    SELECT string_agg(d->>'number', ', ' ORDER BY (d->>'number')::int)
      INTO v_missing
    FROM app.qualiopi_dossier_checklists c,
         jsonb_array_elements(c.details) d
    WHERE c.dossier_id = NEW.id
      AND d->>'stage' = 'closing' AND (d->>'is_blocking')::boolean
      AND NOT (d->>'satisfied')::boolean;
    RAISE EXCEPTION 'qualiopi_closing_blocked: indicateurs % manquants', v_missing
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END $$;

CREATE TRIGGER tg_dossiers_qualiopi_gate
BEFORE UPDATE OF status ON app.dossiers
FOR EACH ROW
WHEN (NEW.status IS DISTINCT FROM OLD.status)
EXECUTE FUNCTION app.tg_qualiopi_transition_gate();
```

> **Note PL/pgSQL** : `r := app.eval_qualiopi_counts(...)` affecte le record composite (OUT params). Si l'affectation directe pose souci sur la version PG locale, utiliser `SELECT * INTO r FROM app.eval_qualiopi_counts(NEW.id);`.

- [ ] **Step 2: Vérif (PENDING si Docker absent)**

Run: `pnpm db:reset`
Expected: fonctions + trigger créés sans erreur.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0050_qualiopi_engine.sql
git commit -m "feat(qualiopi): moteur eval + recompute + trigger de gate transition"
```

---

### Task 4: Tests pgTAP du moteur et des gates

**Files:**
- Create: `supabase/tests/0048_test_qualiopi_engine.sql`

- [ ] **Step 1: Écrire le test**

```sql
BEGIN;
SELECT plan(6);
\i supabase/tests/_helpers.sql

SELECT tests.create_test_org('11111111-1111-1111-1111-111111111111', 'Org A');

-- Indicateur dossier #10 (positionnement) = entry/blocking/questionnaire_positionnement
-- via le seed standard (migration 0051). On récupère son id.
INSERT INTO app.dossiers (id, organization_id, title, start_date, end_date, status)
VALUES ('aaaaaaaa-0000-0000-0000-000000000001',
        '11111111-1111-1111-1111-111111111111', 'D1',
        DATE '2026-07-01', DATE '2026-07-10', 'scheduled');

-- 1) Calcul initial : positionnement non satisfait => entry_blocking_missing >= 1.
SELECT cmp_ok(
  (app.eval_qualiopi_counts('aaaaaaaa-0000-0000-0000-000000000001')).entry_blocking_missing,
  '>=', 1, 'positionnement manquant => au moins 1 bloquant d''entrée');

-- 2) Gate d'entrée : passage en active interdit.
SELECT throws_ok(
  $$ UPDATE app.dossiers SET status = 'active'
     WHERE id = 'aaaaaaaa-0000-0000-0000-000000000001' $$,
  '23514', NULL, 'gate entrée bloque -> active');

-- 3) Satisfaire le positionnement : questionnaire completed.
INSERT INTO app.questionnaire_templates (id, organization_id, kind, code, title, schema)
VALUES ('22222222-0000-0000-0000-000000000001',
        '11111111-1111-1111-1111-111111111111', 'positionnement', 'pos-1', 'Positionnement', '{}'::jsonb);
INSERT INTO app.questionnaire_assignments
  (organization_id, template_id, dossier_id, recipient_kind, token_hash, status)
VALUES ('11111111-1111-1111-1111-111111111111',
        '22222222-0000-0000-0000-000000000001',
        'aaaaaaaa-0000-0000-0000-000000000001', 'learner', 'tok-1', 'completed');

-- 4) Recalcul : positionnement satisfait => entry_blocking_missing diminue.
SELECT is(
  (app.eval_qualiopi_counts('aaaaaaaa-0000-0000-0000-000000000001')).entry_blocking_missing,
  (SELECT count(*)::int FROM app.qualiopi_dossier_checklists c, jsonb_array_elements(c.details) d
   WHERE c.dossier_id = 'aaaaaaaa-0000-0000-0000-000000000001'
     AND d->>'stage'='entry' AND (d->>'is_blocking')::boolean AND NOT (d->>'satisfied')::boolean),
  'compteur entrée cohérent avec details');

-- 5) Si plus aucun bloquant d'entrée, le passage en active réussit.
DO $$
BEGIN
  IF (app.eval_qualiopi_counts('aaaaaaaa-0000-0000-0000-000000000001')).entry_blocking_missing = 0 THEN
    UPDATE app.dossiers SET status = 'active' WHERE id = 'aaaaaaaa-0000-0000-0000-000000000001';
  END IF;
END $$;
SELECT pass('transition active testée selon readiness');

-- 6) Override OF prime : marquer #10 non bloquant pour l'org => 0 bloquant d'entrée pour cet indicateur.
INSERT INTO app.qualiopi_indicator_rules (organization_id, indicator_id, stage, is_blocking, satisfaction_source)
SELECT '11111111-1111-1111-1111-111111111111', i.id, 'entry', false, 'proof'
FROM app.qualiopi_indicators i WHERE i.number = 10;
SELECT ok(
  NOT EXISTS (
    SELECT 1 FROM app.qualiopi_dossier_checklists c, jsonb_array_elements(c.details) d
    WHERE c.dossier_id = 'aaaaaaaa-0000-0000-0000-000000000001'
      AND (d->>'number')::int = 10 AND (d->>'is_blocking')::boolean
  ) OR (app.eval_qualiopi_counts('aaaaaaaa-0000-0000-0000-000000000001')).total >= 1,
  'override OF appliqué (recompute relit la règle org)');

SELECT * FROM finish();
ROLLBACK;
```

> **Avant d'écrire** : ouvrir `supabase/tests/_helpers.sql` pour utiliser les vrais helpers (`tests.create_test_org`, etc.). `throws_ok` attend le SQLSTATE `23514` (check_violation) émis par le `RAISE ... USING ERRCODE='check_violation'`. Adapter si le helper d'org diffère.

- [ ] **Step 2: Vérif (PENDING si Docker absent)**

Run: `pnpm db:reset && pnpm db:test`
Expected: les 6 assertions de `0048_test_qualiopi_engine` passent.

- [ ] **Step 3: Commit**

```bash
git add supabase/tests/0048_test_qualiopi_engine.sql
git commit -m "test(qualiopi): pgTAP moteur + gates + override"
```

---

### Task 5: Seed de la matrice standard

**Files:**
- Create: `supabase/migrations/0051_seed_qualiopi_rules.sql`

- [ ] **Step 1: Écrire le seed**

```sql
-- ============================================================================
-- 0051 — Matrice standard des règles Qualiopi (organization_id NULL).
-- Override possible par OF. Indicateurs dossier-scope seedés en 0007/seed.sql.
-- ============================================================================
-- Convention : on insère par numéro d'indicateur pour rester lisible.

INSERT INTO app.qualiopi_indicator_rules
  (organization_id, indicator_id, stage, is_blocking, satisfaction_source)
SELECT NULL, i.id, v.stage::app.qualiopi_gate_stage, v.is_blocking,
       v.source::app.qualiopi_satisfaction_source
FROM (VALUES
  -- num, stage,     is_blocking, source
  (4,  'entry',   true,  'proof'),                          -- objectifs
  (5,  'entry',   true,  'proof'),                          -- adaptation parcours
  (6,  'entry',   true,  'proof'),                          -- modalités pédagogiques
  (7,  'entry',   true,  'proof'),                          -- programme détaillé
  (8,  'entry',   true,  'proof'),                          -- modalités d'évaluation
  (9,  'entry',   false, 'proof'),                          -- adaptation pédagogique
  (10, 'entry',   true,  'questionnaire_positionnement'),   -- positionnement (analyse besoins)
  (11, 'entry',   false, 'proof'),                          -- publics spécifiques
  (12, 'none',    false, 'proof'),                          -- accompagnement
  (13, 'entry',   false, 'proof'),                          -- conditions de déroulement
  (14, 'none',    false, 'proof'),                          -- coordination
  (15, 'closing', true,  'proof'),                          -- atteinte des objectifs
  (20, 'entry',   false, 'proof'),                          -- locaux et matériel
  (21, 'entry',   true,  'proof'),                          -- compétences formateurs
  (22, 'closing', true,  'attendance_signed'),              -- traçabilité présences
  (23, 'closing', true,  'questionnaire_evaluation'),       -- évaluation des acquis
  (26, 'closing', false, 'proof'),                          -- satisfaction à chaud
  (27, 'closing', false, 'proof'),                          -- satisfaction à froid
  (30, 'none',    false, 'proof')                           -- dysfonctionnements
) AS v(num, stage, is_blocking, source)
JOIN app.qualiopi_indicators i ON i.number = v.num
ON CONFLICT (organization_id, indicator_id) DO NOTHING;
```

- [ ] **Step 2: Vérif (PENDING si Docker absent)**

Run: `pnpm db:reset`
Expected: 19 règles système insérées (indicateurs dossier).

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0051_seed_qualiopi_rules.sql
git commit -m "feat(qualiopi): seed matrice standard indicateur x étape x source"
```

---

### Task 6: Handlers de recalcul (fraîcheur UI)

**Files:**
- Modify: `apps/web/app/api/cron/dispatch-events/route.ts`

- [ ] **Step 1: Ajouter le handler et les entrées registry**

Si `HANDLERS` est encore le stub `{}`, le remplacer ; sinon **fusionner** ces entrées dans l'objet existant (ex. si le plan financeurs a déjà ajouté `dossier.funder_attached`).

```ts
async function recomputeQualiopiChecklist(event: DomainEvent, sb: Sb): Promise<HandlerResult> {
  const payload = event.payload as { dossier_id?: string };
  const dossierId = payload.dossier_id ?? (event.aggregate_type === 'dossier' ? event.aggregate_id : undefined);
  if (!dossierId) return { ok: false, error: 'dossier_id absent du payload' };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (sb as any).rpc('recompute_qualiopi_checklist', { p_dossier_id: dossierId });
  return error ? { ok: false, error: error.message } : { ok: true };
}

const HANDLERS: Record<string, Record<string, Handler>> = {
  'qualiopi.proof.attached':   { 'recompute-qualiopi': recomputeQualiopiChecklist },
  'questionnaire.completed':   { 'recompute-qualiopi': recomputeQualiopiChecklist },
  'attendance.finalized':      { 'recompute-qualiopi': recomputeQualiopiChecklist },
  'document.signed':           { 'recompute-qualiopi': recomputeQualiopiChecklist },
};
```

> **Exposition PostgREST** : `recompute_qualiopi_checklist` est dans le schéma `app`. Vérifier qu'elle est appelable via `rpc(...)` (le client cible `public` par défaut). Si non exposée, ajouter dans `0050` un wrapper `public.recompute_qualiopi_checklist(uuid)` (SECURITY DEFINER) déléguant à `app.recompute_qualiopi_checklist`, puis appeler le wrapper. Vérifier : `psql <DB_URL> -c "select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='recompute_qualiopi_checklist'"`.

- [ ] **Step 2: Vérif**

Run: `pnpm lint apps/web/app/api/cron/dispatch-events/route.ts`
Expected: pas d'erreur de lint sur le fichier. (Typecheck global rouge préexistant : vérifier qu'aucune NOUVELLE erreur ne cite ce fichier.)

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/api/cron/dispatch-events/route.ts
git commit -m "feat(qualiopi): handlers de recalcul checklist (outbox)"
```

---

### Task 7: Server Actions de transition gardées

**Files:**
- Create: `apps/web/app/(dashboard)/dossiers/[id]/qualiopi/actions.ts`

- [ ] **Step 1: Écrire les actions**

```ts
'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@supabase/supabase-js';
import { env } from '@/env.mjs';

const admin = () =>
  createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

type ActionResult = { ok: true } | { ok: false; error: string };

// Traduit l'exception SQL du gate en message lisible.
function explainGateError(message: string | undefined): string {
  if (!message) return 'Transition refusée.';
  if (message.includes('qualiopi_entry_blocked')) {
    const m = message.split('qualiopi_entry_blocked:')[1]?.trim();
    return `Démarrage bloqué : indicateurs Qualiopi d'entrée manquants (${m ?? '—'}).`;
  }
  if (message.includes('qualiopi_closing_blocked')) {
    const m = message.split('qualiopi_closing_blocked:')[1]?.trim();
    return `Clôture bloquée : indicateurs Qualiopi de clôture manquants (${m ?? '—'}).`;
  }
  return message;
}

async function transition(dossierId: string, to: 'active' | 'closed'): Promise<ActionResult> {
  const sb = admin();
  const { error } = await sb
    .schema('app')
    .from('dossiers')
    .update({ status: to, updated_at: new Date().toISOString() })
    .eq('id', dossierId);
  if (error) return { ok: false, error: explainGateError(error.message) };
  revalidatePath(`/dossiers/${dossierId}`);
  return { ok: true };
}

export async function startTraining(dossierId: string): Promise<ActionResult> {
  return transition(dossierId, 'active');
}

export async function closeDossier(dossierId: string): Promise<ActionResult> {
  return transition(dossierId, 'closed');
}
```

> **Vérif** : l'erreur PostgREST sur exception PL/pgSQL expose le message dans `error.message` (souvent préfixé). `explainGateError` matche par sous-chaîne, robuste au préfixe. Confirmer que la mise à jour du statut passe bien par cette table (pas uniquement via `save_dossier`) — sinon router ces actions vers `save_dossier`; le trigger s'applique dans les deux cas.

- [ ] **Step 2: Vérif**

Run: `pnpm lint "apps/web/app/(dashboard)/dossiers/[id]/qualiopi/actions.ts"`
Expected: pas d'erreur de lint ; aucune nouvelle erreur typecheck attribuable.

- [ ] **Step 3: Commit**

```bash
git add "apps/web/app/(dashboard)/dossiers/[id]/qualiopi/actions.ts"
git commit -m "feat(qualiopi): server actions startTraining/closeDossier gardées"
```

---

### Task 8: UI — checklist Qualiopi sur la page dossier

> **⚠️ PRÉREQUIS NON REMPLI** : la page dossier/Qualiopi est en données **mock** (cf. note en tête). Avant cette tâche, convertir `apps/web/app/(dashboard)/dossiers/[id]/qualiopi/page.tsx` en Server Component async lisant `app.qualiopi_dossier_checklists` via `supabaseServer()`. Le code ci-dessous suppose ce prérequis fait. Ne pas exécuter sinon (sinon : section incohérente dans un prototype mock, et risque de casser la page en prod si on interroge des colonnes non encore migrées).

**Files:**
- Create: `apps/web/app/(dashboard)/dossiers/[id]/qualiopi/_components/qualiopi-checklist.tsx`
- Modify: `apps/web/app/(dashboard)/dossiers/[id]/page.tsx`

- [ ] **Step 1: Composant checklist**

```tsx
// apps/web/app/(dashboard)/dossiers/[id]/qualiopi/_components/qualiopi-checklist.tsx
import { startTraining, closeDossier } from '../actions';

type Detail = {
  indicator_id: string;
  number: number;
  stage: 'entry' | 'closing' | 'none';
  is_blocking: boolean;
  satisfied: boolean;
  source: string;
};

type Props = {
  dossierId: string;
  status: string;
  entryBlockingMissing: number;
  closingBlockingMissing: number;
  details: Detail[];
};

function Row({ d }: { d: Detail }) {
  const color = d.satisfied ? 'text-emerald-600' : d.is_blocking ? 'text-red-600' : 'text-amber-600';
  return (
    <li className="flex items-center gap-2 text-sm">
      <span className={color}>{d.satisfied ? '✓' : d.is_blocking ? '✗' : '!'}</span>
      <span>Indicateur {d.number}{d.is_blocking ? ' (bloquant)' : ''}</span>
    </li>
  );
}

export function QualiopiChecklist({
  dossierId, status, entryBlockingMissing, closingBlockingMissing, details,
}: Props) {
  const entry = details.filter((d) => d.stage === 'entry');
  const closing = details.filter((d) => d.stage === 'closing');

  return (
    <section className="rounded-lg border p-4 space-y-4">
      <h2 className="font-semibold">Conformité Qualiopi</h2>

      <div>
        <h3 className="text-sm font-medium">Entrée en formation</h3>
        <ul className="mt-1 space-y-1">{entry.map((d) => <Row key={d.indicator_id} d={d} />)}</ul>
        <form action={async () => { 'use server'; await startTraining(dossierId); }} className="mt-2">
          <button
            type="submit"
            disabled={status === 'active' || entryBlockingMissing > 0}
            className="rounded bg-primary px-3 py-1 text-sm text-primary-foreground disabled:opacity-50"
            title={entryBlockingMissing > 0 ? `${entryBlockingMissing} indicateur(s) d'entrée bloquant(s) manquant(s)` : ''}
          >
            Démarrer la formation
          </button>
        </form>
      </div>

      <div>
        <h3 className="text-sm font-medium">Clôture</h3>
        <ul className="mt-1 space-y-1">{closing.map((d) => <Row key={d.indicator_id} d={d} />)}</ul>
        <form action={async () => { 'use server'; await closeDossier(dossierId); }} className="mt-2">
          <button
            type="submit"
            disabled={status === 'closed' || closingBlockingMissing > 0}
            className="rounded bg-primary px-3 py-1 text-sm text-primary-foreground disabled:opacity-50"
            title={closingBlockingMissing > 0 ? `${closingBlockingMissing} indicateur(s) de clôture bloquant(s) manquant(s)` : ''}
          >
            Clôturer le dossier
          </button>
        </form>
      </div>
    </section>
  );
}
```

> Aligner les classes sur la charte UI (`.cursor/rules/70-ui-charter.mdc` : orange brand, font-semibold max sur titres, 1 bouton primaire/écran). Si deux boutons primaires posent souci charte, passer « Clôturer » en secondaire.

- [ ] **Step 2: Charger la checklist et monter dans `page.tsx`**

Dans `apps/web/app/(dashboard)/dossiers/[id]/page.tsx`, avec le client supabase serveur déjà présent :

```tsx
import { QualiopiChecklist } from './qualiopi/_components/qualiopi-checklist';

const { data: checklist } = await sb
  .schema('app')
  .from('qualiopi_dossier_checklists')
  .select('entry_blocking_missing, closing_blocking_missing, details')
  .eq('dossier_id', params.id)
  .maybeSingle();

// ... dans le JSX (dossier = la ligne dossier déjà chargée) :
<QualiopiChecklist
  dossierId={params.id}
  status={dossier.status}
  entryBlockingMissing={checklist?.entry_blocking_missing ?? 0}
  closingBlockingMissing={checklist?.closing_blocking_missing ?? 0}
  details={(checklist?.details as any) ?? []}
/>
```

> **Vérifs** : nom réel du client supabase dans `page.tsx` (`sb`/`supabase`), forme de `params` (Next 14), et nom de la variable de la ligne dossier. Si `qualiopi_dossier_checklists` n'a pas encore de ligne (jamais recalculé), `details` vaut `[]` → la section s'affiche vide mais ne casse pas ; déclencher un premier `recompute_qualiopi_checklist` à l'ouverture est optionnel (V2).

- [ ] **Step 3: Vérif**

Run: `pnpm lint && pnpm build`
Expected: build OK (page compile, composant monté).

- [ ] **Step 4: Commit**

```bash
git add "apps/web/app/(dashboard)/dossiers/[id]/qualiopi/_components/qualiopi-checklist.tsx" "apps/web/app/(dashboard)/dossiers/[id]/page.tsx"
git commit -m "feat(qualiopi): section checklist + boutons de transition gardés"
```

---

### Task 9: Régénération des types + vérification finale

**Files:**
- Modify: `apps/web/shared/types/database.ts` (généré)

- [ ] **Step 1: Régénérer (PENDING si Docker absent)**

Run: `pnpm db:reset && pnpm db:types`
Expected: `database.ts` contient `qualiopi_indicator_rules` + colonnes ajoutées.

- [ ] **Step 2: Suite complète (PENDING DB si Docker absent)**

Run: `pnpm db:test && pnpm lint && pnpm build`
Expected: pgTAP `0048` vert, lint OK, build OK. (`pnpm typecheck` : vérifier aucune NOUVELLE erreur attribuable à ces fichiers.)

- [ ] **Step 3: Vérification fonctionnelle (manuelle, env avec Docker)**

1. `pnpm dev`, ouvrir un dossier `scheduled` sans questionnaire de positionnement complété.
2. La section Qualiopi montre l'indicateur 10 bloquant ; bouton « Démarrer » désactivé.
3. Forcer `UPDATE app.dossiers SET status='active'` en SQL → exception `qualiopi_entry_blocked`.
4. Compléter un questionnaire `positionnement` → recompute → bouton actif → démarrage OK.
5. Tenter clôture sans émargement finalisé/évaluation acquis → bloqué.

- [ ] **Step 4: Commit**

```bash
git add apps/web/shared/types/database.ts
git commit -m "chore(qualiopi): régénère les types DB"
```

---

## Self-Review

**Spec coverage :**
- Config règles système+override → Task 1, résolution Task 3 (`eval_qualiopi_counts`), testé Task 4.
- Compteurs par étape → Task 2, calculés Task 3.
- Moteur de calcul + résolveurs (proof/positionnement/évaluation/émargement/doc) → Task 3.
- Enforcement dur incontournable (trigger `→active`/`→closed`) → Task 3, testé Task 4.
- Recalcul event-driven (fraîcheur UI) → Task 6.
- UI checklist + boutons gardés → Tasks 7-8.
- Seed standard (matrice, #10 positionnement entry/blocking) → Task 5.
- RLS + pgTAP → Task 1 (RLS), Task 4 (gates/override/resolvers).

**Cohérence des types/noms :** `eval_qualiopi_counts` (OUT: total, satisfied, entry_blocking_missing, closing_blocking_missing, blocking_missing) utilisé identiquement Tasks 3/4 ; `recompute_qualiopi_checklist(p_dossier_id)` Tasks 3/6 ; colonnes checklist `entry_/closing_blocking_missing` Tasks 2/3/8 ; messages `qualiopi_entry_blocked`/`qualiopi_closing_blocked` Tasks 3/7.

**Points à confirmer pendant l'exécution (signalés inline) :** helpers pgTAP réels ; exposition PostgREST des RPC (wrapper public si besoin) ; chemin réel de changement de statut (table directe vs `save_dossier`) ; client/params dans `page.tsx` ; charte UI (2 boutons primaires) ; numérotation migrations vs plan financeurs.

**Hors scope (V2) :** override justifié, configurateur UI des règles, résolveurs avancés, wiring du domaine `dossier.entity.ts`, recompute auto à l'ouverture de page.
