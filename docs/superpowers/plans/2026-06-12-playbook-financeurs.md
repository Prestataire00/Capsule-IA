# Playbooks financeurs — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Générer un brouillon d'email + pièces jointes paramétré par financeur pour chaque dossier, avec un calendrier d'envoi relatif au cycle de vie, validé/envoyé en 1 clic par l'humain.

**Architecture:** Deux couches « bibliothèque système + override par OF » calquées sur `app.document_templates`. Un playbook par `funder_kind` porte des étapes (ancre cycle de vie + offset + templates email + docs requis + CCN). Le rattachement d'un financeur émet un `domain_event` via trigger → le cron `dispatch-events` appelle une RPC SQL qui matérialise des tâches (`dossier_funder_tasks`) avec `due_date` calculée. Des Server Actions assemblent le brouillon (résolution des pièces jointes) puis envoient via Resend.

**Tech Stack:** Postgres/Supabase (migrations SQL + RPC SECURITY DEFINER + RLS + pgTAP), Next.js 14 App Router (Server Actions), Resend, Vitest.

---

## Statut d'exécution (2026-06-12)

- ✅ **Task 6** (pièces jointes `sendEmail`) et ✅ **Task 7** (renderer + décision attach/lien) livrées et poussées sur `main` (commit `06d040c`).
- **Déviation Task 7** : `server-only` n'étant ni mocké ni aliasé dans Vitest, la logique pure a été extraite hors de `templates.ts` — `apps/web/shared/lib/email/funder-render.ts` (`renderFunderEmail` → `{subject, bodyHtml}`) et `apps/web/shared/lib/funders/attachments.ts` (`decideTransport`), testés. `templates.ts` ne porte que le wrapper serveur **`funderEmail(tpl, vars) → {subject, html}`**.
- ⏳ **Tasks 1-5, 8-11** en attente : nécessitent un runtime de conteneurs (Docker/OrbStack) pour Supabase local (`db:reset`, `db:test`, `db:types`). Non lançables tant que Docker est absent.
- ⚠️ Pré-existant (hors scope) : `pnpm typecheck` est rouge sur `main` avant toute modif (déclaration `@/env.mjs` manquante, `any` implicites dans `shared/lib/supabase/*`, `date-of-birth-input.tsx`). À traiter séparément.

---

## Conventions du repo (vérifiées)

- Migrations : `supabase/migrations/NNNN_*.sql`, dernière = `0042`. Nouvelles → `0043`+.
- Tests pgTAP : `supabase/tests/NNNN_test_*.sql`, helper `supabase/tests/_helpers.sql`, lancés par `pnpm db:test`. Dernière = `0046`. Nouvelles → `0047`+.
- Reset DB locale + types : `pnpm db:reset` puis `pnpm db:types`.
- Tests web (Vitest) : `pnpm test`. Lint/types : `pnpm lint`, `pnpm typecheck`.
- `domain_events` : colonne d'event = **`type`** (pas `kind`). Émission par INSERT direct (cf. trigger 0034) ou via `save_dossier(p_dossier, p_events)`.
- Dispatcher : `apps/web/app/api/cron/dispatch-events/route.ts`. `HANDLERS: Record<string, Record<string, Handler>>`, `Handler = (event: DomainEvent, sb: Sb) => Promise<HandlerResult>`, `HandlerResult = {ok:true} | {ok:false,error:string}`. Idempotence garantie par `processed_events`.
- Server Actions : `'use server'`, client `createClient(URL, SERVICE_ROLE_KEY, {auth:{persistSession:false}})`, scoping org manuel depuis la ligne dossier (cf. `apps/web/app/(dashboard)/factures/actions.ts`).
- Email : `sendEmail()` dans `apps/web/shared/lib/email/resend.ts` (PAS de pièces jointes aujourd'hui), templates dans `apps/web/shared/lib/email/templates.ts` (wrapper HTML `wrapper`/`card`/`button`).
- Dates dossier : `app.dossiers.start_date DATE`, `end_date DATE`, `created_at`. Sessions dans `app.sessions` (non requis en phase 1).

## File Structure

**Migrations (créer)**
- `supabase/migrations/0043_funder_kind_extend.sql` — `ALTER TYPE app.funder_kind ADD VALUE faf_ca, agefiph`.
- `supabase/migrations/0044_funder_playbooks.sql` — enum `funder_step_anchor`, tables `funder_playbooks` + `funder_playbook_steps`, RLS.
- `supabase/migrations/0045_dossier_funder_tasks.sql` — enum `funder_task_status`, table `dossier_funder_tasks`, RLS.
- `supabase/migrations/0046_funder_materialization.sql` — kind `convention_collective`, RPC `app.materialize_funder_tasks`, trigger `dossier_funders` → event.
- `supabase/migrations/0047_seed_funder_playbooks.sql` — playbooks système (OPCO, AGEFIPH, FAF-CA).

**Tests pgTAP (créer)**
- `supabase/tests/0047_test_funder_playbook_resolution.sql` — résolution override>système, calcul `due_date`, RLS cross-tenant.

**App (créer)**
- `apps/web/shared/lib/funders/attachments.ts` — seuil + types résolution PJ (testable pur).
- `apps/web/app/(dashboard)/dossiers/[id]/financeurs/actions.ts` — `prepareFunderTaskDraft`, `sendFunderTask`.
- `apps/web/app/(dashboard)/dossiers/[id]/financeurs/_components/funder-tasks-section.tsx` — UI.
- `apps/web/shared/lib/email/__tests__/funder-email.test.ts`, `apps/web/shared/lib/funders/__tests__/attachments.test.ts` — Vitest.

**App (modifier)**
- `apps/web/shared/lib/email/resend.ts` — support `attachments`.
- `apps/web/shared/lib/email/templates.ts` — `renderFunderEmail()`.
- `apps/web/app/api/cron/dispatch-events/route.ts` — enregistrer handler.
- `apps/web/app/(dashboard)/dossiers/[id]/page.tsx` — monter `FunderTasksSection`.

---

### Task 1: Étendre l'enum `funder_kind`

**Files:**
- Create: `supabase/migrations/0043_funder_kind_extend.sql`

- [ ] **Step 1: Écrire la migration**

```sql
-- ============================================================================
-- 0043 — Ajoute FAF-CA et AGEFIPH aux types de financeur
-- ============================================================================
-- ALTER TYPE ... ADD VALUE doit être hors transaction d'usage immédiat.
-- Supabase applique chaque fichier de migration dans sa propre transaction ;
-- ces valeurs ne sont donc utilisables qu'à partir de la migration suivante.

ALTER TYPE app.funder_kind ADD VALUE IF NOT EXISTS 'faf_ca';
ALTER TYPE app.funder_kind ADD VALUE IF NOT EXISTS 'agefiph';
```

- [ ] **Step 2: Appliquer et vérifier**

Run: `pnpm db:reset && supabase db query "SELECT unnest(enum_range(NULL::app.funder_kind))::text ORDER BY 1" --local 2>/dev/null || psql "$(supabase status --local -o json | python3 -c 'import sys,json;print(json.load(sys.stdin)["DB_URL"])')" -c "SELECT enum_range(NULL::app.funder_kind)"`
Expected: la liste contient `faf_ca` et `agefiph`.

> Si la commande `supabase db query` n'existe pas dans cette version CLI, utiliser : `psql <DB_URL local> -c "SELECT enum_range(NULL::app.funder_kind);"`. Le `DB_URL` local est affiché par `supabase status`.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0043_funder_kind_extend.sql
git commit -m "feat(financeurs): ajoute faf_ca et agefiph à funder_kind"
```

---

### Task 2: Tables playbooks + étapes

**Files:**
- Create: `supabase/migrations/0044_funder_playbooks.sql`

- [ ] **Step 1: Écrire la migration (schéma + RLS)**

```sql
-- ============================================================================
-- 0044 — Playbooks financeurs (bibliothèque système + override par OF)
-- ============================================================================

-- Ancre du calendrier relatif au cycle de vie du dossier.
CREATE TYPE app.funder_step_anchor AS ENUM (
  'dossier_created', 'session_start', 'session_end', 'manual'
);

-- Un playbook par (org|système) × funder_kind. organization_id NULL = système.
CREATE TABLE app.funder_playbooks (
  id UUID PRIMARY KEY DEFAULT uuidv7(),
  organization_id UUID REFERENCES app.organizations(id) ON DELETE CASCADE,
  is_system BOOLEAN GENERATED ALWAYS AS (organization_id IS NULL) STORED,
  funder_kind app.funder_kind NOT NULL,
  code TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  version INT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ NULL,
  UNIQUE (organization_id, code)
);

CREATE INDEX ix_funder_playbooks_resolve
  ON app.funder_playbooks (funder_kind, organization_id)
  WHERE deleted_at IS NULL AND is_active;

CREATE TABLE app.funder_playbook_steps (
  id UUID PRIMARY KEY DEFAULT uuidv7(),
  playbook_id UUID NOT NULL REFERENCES app.funder_playbooks(id) ON DELETE CASCADE,
  organization_id UUID REFERENCES app.organizations(id) ON DELETE CASCADE,
  step_order INT NOT NULL,
  anchor app.funder_step_anchor NOT NULL,
  offset_days INT NOT NULL DEFAULT 0,
  email_subject_template TEXT NOT NULL,
  email_body_template TEXT NOT NULL,
  required_document_kinds TEXT[] NOT NULL DEFAULT '{}',
  reference_document_codes TEXT[] NOT NULL DEFAULT '{}',
  is_required BOOLEAN NOT NULL DEFAULT true,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (playbook_id, step_order)
);

CREATE INDEX ix_funder_playbook_steps_playbook
  ON app.funder_playbook_steps (playbook_id, step_order);

-- RLS : système (org NULL) lisible par tous les authentifiés ; lignes org
-- visibles/éditables seulement par leur org. Écriture système réservée au
-- service_role (seed) — aucune policy d'écriture pour les lignes org NULL.
ALTER TABLE app.funder_playbooks ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.funder_playbook_steps ENABLE ROW LEVEL SECURITY;

CREATE POLICY funder_playbooks_read ON app.funder_playbooks
  FOR SELECT TO authenticated
  USING (organization_id IS NULL OR organization_id = app.current_org_id());

CREATE POLICY funder_playbooks_write ON app.funder_playbooks
  FOR ALL TO authenticated
  USING (organization_id = app.current_org_id())
  WITH CHECK (organization_id = app.current_org_id());

CREATE POLICY funder_playbook_steps_read ON app.funder_playbook_steps
  FOR SELECT TO authenticated
  USING (organization_id IS NULL OR organization_id = app.current_org_id());

CREATE POLICY funder_playbook_steps_write ON app.funder_playbook_steps
  FOR ALL TO authenticated
  USING (organization_id = app.current_org_id())
  WITH CHECK (organization_id = app.current_org_id());
```

> **Avant d'écrire** : vérifier le nom exact du helper d'org utilisé par les RLS existantes (`grep -rn "current_org_id\|current_organization\|auth_org" supabase/migrations/0019_rls_identity_crm_catalog.sql supabase/migrations/0020_rls_dossier.sql | head`). Remplacer `app.current_org_id()` par le helper réel si différent.

- [ ] **Step 2: Appliquer**

Run: `pnpm db:reset`
Expected: reset OK, aucune erreur SQL.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0044_funder_playbooks.sql
git commit -m "feat(financeurs): tables funder_playbooks + steps avec RLS"
```

---

### Task 3: Table des tâches matérialisées

**Files:**
- Create: `supabase/migrations/0045_dossier_funder_tasks.sql`

- [ ] **Step 1: Écrire la migration**

```sql
-- ============================================================================
-- 0045 — Tâches matérialisées par dossier × financeur (checklist + brouillon)
-- ============================================================================

CREATE TYPE app.funder_task_status AS ENUM (
  'pending', 'ready', 'drafted', 'sent', 'done', 'skipped'
);

CREATE TABLE app.dossier_funder_tasks (
  id UUID PRIMARY KEY DEFAULT uuidv7(),
  organization_id UUID NOT NULL REFERENCES app.organizations(id) ON DELETE CASCADE,
  dossier_id UUID NOT NULL REFERENCES app.dossiers(id) ON DELETE CASCADE,
  funder_id UUID NOT NULL REFERENCES app.funders(id) ON DELETE CASCADE,
  playbook_step_id UUID NOT NULL REFERENCES app.funder_playbook_steps(id) ON DELETE CASCADE,
  due_date DATE,
  status app.funder_task_status NOT NULL DEFAULT 'pending',
  draft_subject TEXT,
  draft_html TEXT,
  resolved_attachments JSONB NOT NULL DEFAULT '[]'::jsonb,
  sent_at TIMESTAMPTZ,
  sent_by UUID REFERENCES auth.users(id),
  resend_message_id TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (dossier_id, funder_id, playbook_step_id)
);

CREATE INDEX ix_dossier_funder_tasks_dossier
  ON app.dossier_funder_tasks (dossier_id, funder_id);
CREATE INDEX ix_dossier_funder_tasks_due
  ON app.dossier_funder_tasks (organization_id, due_date)
  WHERE status IN ('pending', 'ready', 'drafted');

ALTER TABLE app.dossier_funder_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY dossier_funder_tasks_rw ON app.dossier_funder_tasks
  FOR ALL TO authenticated
  USING (organization_id = app.current_org_id())
  WITH CHECK (organization_id = app.current_org_id());
```

> Même vérification du helper d'org qu'en Task 2.

- [ ] **Step 2: Appliquer**

Run: `pnpm db:reset`
Expected: reset OK.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0045_dossier_funder_tasks.sql
git commit -m "feat(financeurs): table dossier_funder_tasks avec RLS"
```

---

### Task 4: RPC de matérialisation + trigger d'event + kind CCN

**Files:**
- Create: `supabase/migrations/0046_funder_materialization.sql`

- [ ] **Step 1: Écrire la migration**

```sql
-- ============================================================================
-- 0046 — Matérialisation des tâches financeur + déclencheur outbox + kind CCN
-- ============================================================================

-- 1) Nouveau kind de document pour la bibliothèque de conventions collectives.
ALTER TABLE app.document_templates DROP CONSTRAINT IF EXISTS document_templates_kind_check;
ALTER TABLE app.document_templates ADD CONSTRAINT document_templates_kind_check
  CHECK (kind IN (
    'convention', 'convocation', 'programme', 'attestation_presence',
    'attestation_fin', 'certificat_realisation', 'reglement_interieur',
    'livret_accueil', 'devis', 'facture', 'feuille_emargement',
    'questionnaire', 'convention_collective', 'autre'
  ));

-- 2) Résout le playbook applicable (override org > système) et matérialise
--    les tâches avec due_date = ancre(dates dossier) + offset_days.
--    Idempotent : ON CONFLICT met à jour due_date tant que la tâche n'est pas
--    envoyée/terminée.
CREATE OR REPLACE FUNCTION app.materialize_funder_tasks(
  p_dossier_id UUID,
  p_funder_id UUID
) RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
  v_org UUID;
  v_start DATE;
  v_end DATE;
  v_created DATE;
  v_kind app.funder_kind;
  v_playbook UUID;
  v_count INT := 0;
BEGIN
  SELECT d.organization_id, d.start_date, d.end_date, d.created_at::date
    INTO v_org, v_start, v_end, v_created
  FROM app.dossiers d WHERE d.id = p_dossier_id;
  IF v_org IS NULL THEN RETURN 0; END IF;

  SELECT f.kind INTO v_kind
  FROM app.funders f WHERE f.id = p_funder_id AND f.organization_id = v_org;
  IF v_kind IS NULL THEN RETURN 0; END IF;

  -- override org > système
  SELECT pb.id INTO v_playbook
  FROM app.funder_playbooks pb
  WHERE pb.funder_kind = v_kind
    AND pb.is_active AND pb.deleted_at IS NULL
    AND (pb.organization_id = v_org OR pb.organization_id IS NULL)
  ORDER BY (pb.organization_id IS NOT NULL) DESC
  LIMIT 1;
  IF v_playbook IS NULL THEN RETURN 0; END IF;

  INSERT INTO app.dossier_funder_tasks AS t (
    organization_id, dossier_id, funder_id, playbook_step_id, due_date, status
  )
  SELECT
    v_org, p_dossier_id, p_funder_id, s.id,
    CASE s.anchor
      WHEN 'dossier_created' THEN v_created
      WHEN 'session_start'   THEN v_start
      WHEN 'session_end'     THEN v_end
      WHEN 'manual'          THEN NULL
    END + (s.offset_days || ' days')::interval,
    'pending'
  FROM app.funder_playbook_steps s
  WHERE s.playbook_id = v_playbook
  ON CONFLICT (dossier_id, funder_id, playbook_step_id) DO UPDATE
    SET due_date = EXCLUDED.due_date, updated_at = now()
    WHERE t.status NOT IN ('sent', 'done');

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END $$;

REVOKE ALL ON FUNCTION app.materialize_funder_tasks(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.materialize_funder_tasks(UUID, UUID) TO service_role;

-- 3) Trigger : tout rattachement d'un financeur émet un domain_event.
CREATE OR REPLACE FUNCTION app.tg_emit_funder_attached()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, infra, public
AS $$
DECLARE v_org UUID;
BEGIN
  SELECT organization_id INTO v_org FROM app.dossiers WHERE id = NEW.dossier_id;
  INSERT INTO infra.domain_events (
    organization_id, aggregate_type, aggregate_id, type, payload
  ) VALUES (
    v_org, 'dossier', NEW.dossier_id, 'dossier.funder_attached',
    jsonb_build_object('dossier_id', NEW.dossier_id, 'funder_id', NEW.funder_id)
  );
  RETURN NEW;
END $$;

CREATE TRIGGER tg_dossier_funders_emit_attached
AFTER INSERT ON app.dossier_funders
FOR EACH ROW EXECUTE FUNCTION app.tg_emit_funder_attached();
```

> **Cast du `due_date`** : `DATE + interval` renvoie un `timestamp`. La colonne `due_date` étant `DATE`, Postgres cast implicitement à l'INSERT ; si une erreur de type apparaît, encadrer le `CASE ... END + interval` par `(...)::date`.

- [ ] **Step 2: Écrire le test pgTAP de résolution + due_date + RLS**

**Files:**
- Create: `supabase/tests/0047_test_funder_playbook_resolution.sql`

```sql
BEGIN;
SELECT plan(5);

-- Helpers existants : créent orgs/users de test. Cf. supabase/tests/_helpers.sql
\i supabase/tests/_helpers.sql

-- Deux orgs + un dossier + un financeur OPCO dans org A.
SELECT tests.create_test_org('11111111-1111-1111-1111-111111111111', 'Org A');
SELECT tests.create_test_org('22222222-2222-2222-2222-222222222222', 'Org B');

INSERT INTO app.dossiers (id, organization_id, title, start_date, end_date)
VALUES ('aaaaaaaa-0000-0000-0000-000000000001',
        '11111111-1111-1111-1111-111111111111', 'D1',
        DATE '2026-07-01', DATE '2026-07-10');

INSERT INTO app.funders (id, organization_id, kind, name)
VALUES ('ffffffff-0000-0000-0000-000000000001',
        '11111111-1111-1111-1111-111111111111', 'opco', 'OPCO Test');

-- Playbook SYSTÈME (org NULL) avec une étape session_start - 15j.
INSERT INTO app.funder_playbooks (id, organization_id, funder_kind, code, title)
VALUES ('bbbbbbbb-0000-0000-0000-000000000001', NULL, 'opco', 'sys-opco', 'Système OPCO');
INSERT INTO app.funder_playbook_steps
  (playbook_id, organization_id, step_order, anchor, offset_days,
   email_subject_template, email_body_template)
VALUES
  ('bbbbbbbb-0000-0000-0000-000000000001', NULL, 1, 'session_start', -15,
   'Sujet sys', 'Corps sys');

-- Matérialise via le système : 1 tâche, due_date = 2026-06-16.
SELECT is(app.materialize_funder_tasks(
  'aaaaaaaa-0000-0000-0000-000000000001',
  'ffffffff-0000-0000-0000-000000000001'), 1, 'matérialise 1 tâche (système)');

SELECT is(
  (SELECT due_date FROM app.dossier_funder_tasks
   WHERE dossier_id = 'aaaaaaaa-0000-0000-0000-000000000001'),
  DATE '2026-06-16', 'due_date = session_start - 15j');

-- Override ORG : playbook org A même funder_kind => doit primer.
INSERT INTO app.funder_playbooks (id, organization_id, funder_kind, code, title)
VALUES ('cccccccc-0000-0000-0000-000000000001',
        '11111111-1111-1111-1111-111111111111', 'opco', 'org-opco', 'Org OPCO');
INSERT INTO app.funder_playbook_steps
  (playbook_id, organization_id, step_order, anchor, offset_days,
   email_subject_template, email_body_template)
VALUES
  ('cccccccc-0000-0000-0000-000000000001',
   '11111111-1111-1111-1111-111111111111', 1, 'session_end', 7,
   'Sujet org', 'Corps org');

-- Nettoyage tâches puis re-matérialise : doit utiliser le playbook org.
DELETE FROM app.dossier_funder_tasks
WHERE dossier_id = 'aaaaaaaa-0000-0000-0000-000000000001';
PERFORM app.materialize_funder_tasks(
  'aaaaaaaa-0000-0000-0000-000000000001',
  'ffffffff-0000-0000-0000-000000000001');

SELECT is(
  (SELECT due_date FROM app.dossier_funder_tasks
   WHERE dossier_id = 'aaaaaaaa-0000-0000-0000-000000000001'),
  DATE '2026-07-17', 'override org prime : session_end + 7j');

-- RLS : un user de org B ne voit pas les tâches de org A.
SELECT tests.authenticate_as('22222222-2222-2222-2222-222222222222');
SELECT is(
  (SELECT count(*)::int FROM app.dossier_funder_tasks
   WHERE dossier_id = 'aaaaaaaa-0000-0000-0000-000000000001'),
  0, 'RLS : org B ne voit pas les tâches de org A');

-- RLS : org B lit bien les playbooks système (org NULL).
SELECT isnt(
  (SELECT count(*)::int FROM app.funder_playbooks WHERE organization_id IS NULL),
  0, 'RLS : playbooks système lisibles par toutes les orgs');

SELECT * FROM finish();
ROLLBACK;
```

> **Avant d'écrire le test** : ouvrir `supabase/tests/_helpers.sql` et `supabase/tests/0043_test_rls_cross_tenant_baseline.sql` pour utiliser les helpers réels (`tests.create_test_org`, `tests.authenticate_as` ou équivalents). Adapter les noms si différents — ne pas inventer de helper.

- [ ] **Step 3: Lancer le test (doit échouer puis passer)**

Run: `pnpm db:reset && pnpm db:test`
Expected: les 5 assertions de `0047_test_funder_playbook_resolution` passent.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0046_funder_materialization.sql supabase/tests/0047_test_funder_playbook_resolution.sql
git commit -m "feat(financeurs): RPC matérialisation + trigger outbox + kind CCN + pgTAP"
```

---

### Task 5: Seed des playbooks système

**Files:**
- Create: `supabase/migrations/0047_seed_funder_playbooks.sql`

- [ ] **Step 1: Écrire le seed (OPCO, AGEFIPH, FAF-CA)**

```sql
-- ============================================================================
-- 0047 — Playbooks système (organization_id NULL). Override possible par OF.
-- ============================================================================
-- Templates email avec variables {{stagiaire}}, {{financeur}}, {{dossier}},
-- {{date_debut}}, {{date_fin}}, {{organisme}} (rendues par renderFunderEmail).

INSERT INTO app.funder_playbooks (id, organization_id, funder_kind, code, title, description)
VALUES
  ('d0000000-0000-0000-0000-0000000000a1', NULL, 'opco',    'sys-opco-v1',    'OPCO — standard', 'Process OPCO par défaut'),
  ('d0000000-0000-0000-0000-0000000000a2', NULL, 'agefiph', 'sys-agefiph-v1', 'AGEFIPH — standard', 'Process AGEFIPH par défaut'),
  ('d0000000-0000-0000-0000-0000000000a3', NULL, 'faf_ca',  'sys-fafca-v1',   'FAF-CA — standard', 'Process FAF-CA par défaut')
ON CONFLICT (organization_id, code) DO NOTHING;

-- OPCO : devis+programme à J-15, attestation de fin à J+0.
INSERT INTO app.funder_playbook_steps
  (playbook_id, organization_id, step_order, anchor, offset_days,
   email_subject_template, email_body_template, required_document_kinds, reference_document_codes)
VALUES
  ('d0000000-0000-0000-0000-0000000000a1', NULL, 1, 'session_start', -15,
   'Dossier de prise en charge — {{stagiaire}}',
   'Bonjour,\n\nVeuillez trouver ci-joint le dossier de prise en charge pour {{stagiaire}} (formation du {{date_debut}} au {{date_fin}}).\n\nCordialement,\n{{organisme}}',
   ARRAY['devis','programme','convention'], ARRAY[]::text[]),
  ('d0000000-0000-0000-0000-0000000000a1', NULL, 2, 'session_end', 0,
   'Attestation de fin de formation — {{stagiaire}}',
   'Bonjour,\n\nLa formation de {{stagiaire}} est terminée. Vous trouverez ci-joint l''attestation de fin et le certificat de réalisation.\n\nCordialement,\n{{organisme}}',
   ARRAY['attestation_fin','certificat_realisation'], ARRAY[]::text[]);

-- AGEFIPH : dossier à J-15.
INSERT INTO app.funder_playbook_steps
  (playbook_id, organization_id, step_order, anchor, offset_days,
   email_subject_template, email_body_template, required_document_kinds, reference_document_codes)
VALUES
  ('d0000000-0000-0000-0000-0000000000a2', NULL, 1, 'session_start', -15,
   'Demande de financement AGEFIPH — {{stagiaire}}',
   'Bonjour,\n\nCi-joint le dossier de demande de financement pour {{stagiaire}}.\n\nCordialement,\n{{organisme}}',
   ARRAY['devis','programme','convention'], ARRAY[]::text[]);

-- FAF-CA : dossier à J-15 (avec convention collective agricole).
INSERT INTO app.funder_playbook_steps
  (playbook_id, organization_id, step_order, anchor, offset_days,
   email_subject_template, email_body_template, required_document_kinds, reference_document_codes)
VALUES
  ('d0000000-0000-0000-0000-0000000000a3', NULL, 1, 'session_start', -15,
   'Demande de prise en charge FAF-CA — {{stagiaire}}',
   'Bonjour,\n\nCi-joint la demande de prise en charge pour {{stagiaire}}.\n\nCordialement,\n{{organisme}}',
   ARRAY['devis','programme','convention'], ARRAY[]::text[]);
```

- [ ] **Step 2: Appliquer**

Run: `pnpm db:reset`
Expected: reset OK, 3 playbooks système insérés.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0047_seed_funder_playbooks.sql
git commit -m "feat(financeurs): seed playbooks système OPCO/AGEFIPH/FAF-CA"
```

---

### Task 6: Pièces jointes dans `sendEmail`

**Files:**
- Modify: `apps/web/shared/lib/email/resend.ts`

- [ ] **Step 1: Étendre le type et l'appel Resend**

Remplacer le bloc `SendEmailInput` + `sendEmail` par :

```ts
export type EmailAttachment = {
  filename: string;
  content?: string; // base64
  path?: string;    // URL (fallback lien si pièce trop lourde)
};

export type SendEmailInput = {
  to: string | string[];
  subject: string;
  html: string;
  replyTo?: string;
  attachments?: EmailAttachment[];
};

export type SendEmailResult =
  | { ok: true; id: string }
  | { ok: false; reason: 'no_api_key' | 'send_failed'; error?: unknown };

export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const c = client();
  if (!c) return { ok: false, reason: 'no_api_key' };

  try {
    const { data, error } = await c.emails.send({
      from: env.EMAIL_FROM ?? DEFAULT_FROM,
      to: input.to,
      subject: input.subject,
      html: input.html,
      replyTo: input.replyTo,
      attachments: input.attachments?.map((a) => ({
        filename: a.filename,
        ...(a.content ? { content: a.content } : {}),
        ...(a.path ? { path: a.path } : {}),
      })),
    });
    if (error || !data) return { ok: false, reason: 'send_failed', error };
    return { ok: true, id: data.id };
  } catch (error) {
    return { ok: false, reason: 'send_failed', error };
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: PASS (aucune erreur).

- [ ] **Step 3: Commit**

```bash
git add apps/web/shared/lib/email/resend.ts
git commit -m "feat(email): support des pièces jointes dans sendEmail"
```

---

### Task 7: Résolution des pièces jointes (seuil) + renderer email

**Files:**
- Create: `apps/web/shared/lib/funders/attachments.ts`
- Create: `apps/web/shared/lib/funders/__tests__/attachments.test.ts`
- Modify: `apps/web/shared/lib/email/templates.ts`
- Create: `apps/web/shared/lib/email/__tests__/funder-email.test.ts`

- [ ] **Step 1: Test du seuil PJ vs lien (Vitest)**

```ts
// apps/web/shared/lib/funders/__tests__/attachments.test.ts
import { describe, it, expect } from 'vitest';
import { decideTransport, RESEND_MAX_ATTACH_BYTES } from '../attachments';

describe('decideTransport', () => {
  it('attache quand le total reste sous le seuil', () => {
    expect(decideTransport([1_000, 2_000])).toBe('attach');
  });
  it('bascule en lien quand le total dépasse le seuil', () => {
    expect(decideTransport([RESEND_MAX_ATTACH_BYTES, 1])).toBe('link');
  });
});
```

- [ ] **Step 2: Lancer (doit échouer)**

Run: `pnpm test attachments`
Expected: FAIL — module `../attachments` introuvable.

- [ ] **Step 3: Implémenter le module**

```ts
// apps/web/shared/lib/funders/attachments.ts
// Resend plafonne ~40 MB par email (total). On garde une marge.
export const RESEND_MAX_ATTACH_BYTES = 30 * 1024 * 1024;

export type AttachmentTransport = 'attach' | 'link';

export type ResolvedAttachment = {
  filename: string;
  storage_path: string;
  bytes: number;
  transport: AttachmentTransport;
};

/** Décide attach vs link selon la somme des tailles. */
export function decideTransport(sizes: number[]): AttachmentTransport {
  const total = sizes.reduce((a, b) => a + b, 0);
  return total > RESEND_MAX_ATTACH_BYTES ? 'link' : 'attach';
}
```

- [ ] **Step 4: Vérifier le test**

Run: `pnpm test attachments`
Expected: PASS (2 tests).

- [ ] **Step 5: Test du renderer funder email (Vitest)**

```ts
// apps/web/shared/lib/email/__tests__/funder-email.test.ts
import { describe, it, expect } from 'vitest';
import { renderFunderEmail } from '../templates';

describe('renderFunderEmail', () => {
  it('remplace les variables {{...}} dans sujet et corps', () => {
    const out = renderFunderEmail(
      { subjectTemplate: 'Dossier {{stagiaire}}', bodyTemplate: 'Du {{date_debut}} au {{date_fin}}' },
      { stagiaire: 'Jean Dupont', date_debut: '01/07/2026', date_fin: '10/07/2026' },
    );
    expect(out.subject).toBe('Dossier Jean Dupont');
    expect(out.html).toContain('Du 01/07/2026 au 10/07/2026');
  });
  it('laisse un placeholder inconnu vide plutôt que le littéral', () => {
    const out = renderFunderEmail(
      { subjectTemplate: 'X {{inconnu}}', bodyTemplate: 'Y' },
      {},
    );
    expect(out.subject).toBe('X ');
  });
});
```

- [ ] **Step 6: Lancer (doit échouer)**

Run: `pnpm test funder-email`
Expected: FAIL — `renderFunderEmail` non exporté.

- [ ] **Step 7: Implémenter `renderFunderEmail` dans `templates.ts`**

Ajouter à la fin de `apps/web/shared/lib/email/templates.ts` (réutilise le `wrapper`/`card` existants en haut du fichier) :

```ts
export type FunderEmailTemplate = { subjectTemplate: string; bodyTemplate: string };

/** Rend un template funder : remplace {{cle}} par vars[cle] (vide si absent),
 *  échappe le HTML, convertit les sauts de ligne, enveloppe dans le wrapper. */
export function renderFunderEmail(
  tpl: FunderEmailTemplate,
  vars: Record<string, string>,
): { subject: string; html: string } {
  const fill = (s: string) =>
    s.replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (_, k) => vars[k] ?? '');
  const escapeHtml = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const subject = fill(tpl.subjectTemplate);
  const body = escapeHtml(fill(tpl.bodyTemplate)).replace(/\n/g, '<br/>');
  return { subject, html: wrapper(card(body)) };
}
```

> Vérifier que `wrapper` et `card` sont définis plus haut dans le fichier (lignes ~13 et ~34). Si `card` prend des options, passer juste la chaîne `body`.

- [ ] **Step 8: Vérifier**

Run: `pnpm test funder-email && pnpm typecheck`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add apps/web/shared/lib/funders/attachments.ts apps/web/shared/lib/funders/__tests__/attachments.test.ts apps/web/shared/lib/email/templates.ts apps/web/shared/lib/email/__tests__/funder-email.test.ts
git commit -m "feat(financeurs): renderer email funder + décision attach/lien (TDD)"
```

---

### Task 8: Enregistrer le handler dans le dispatcher

**Files:**
- Modify: `apps/web/app/api/cron/dispatch-events/route.ts`

- [ ] **Step 1: Ajouter le handler et l'entrée registry**

Remplacer le stub `const HANDLERS ... = {};` par :

```ts
async function materializeFunderPlaybook(event: DomainEvent, sb: Sb): Promise<HandlerResult> {
  const payload = event.payload as { dossier_id?: string; funder_id?: string };
  if (!payload.dossier_id || !payload.funder_id) {
    return { ok: false, error: 'payload manquant dossier_id/funder_id' };
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (sb as any).rpc('materialize_funder_tasks', {
    p_dossier_id: payload.dossier_id,
    p_funder_id: payload.funder_id,
  });
  return error ? { ok: false, error: error.message } : { ok: true };
}

const HANDLERS: Record<string, Record<string, Handler>> = {
  'dossier.funder_attached': {
    'materialize-funder-playbook': materializeFunderPlaybook,
  },
};
```

> La RPC est dans le schéma `app` ; `supabaseAdmin()` (service_role) appelle `rpc('materialize_funder_tasks', …)` sur le schéma public par défaut. Si la fonction n'est pas exposée via PostgREST, l'exposer en la déclarant aussi en wrapper `public.materialize_funder_tasks` (SECURITY DEFINER) appelant `app.materialize_funder_tasks`, dans la migration 0046. Vérifier d'abord : `psql <DB_URL> -c "select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='materialize_funder_tasks'"`. Si absent, ajouter le wrapper public à 0046 avant de continuer.

- [ ] **Step 2: Typecheck + lint**

Run: `pnpm typecheck && pnpm lint`
Expected: PASS.

- [ ] **Step 3: Test d'intégration manuel du dispatch**

Run:
```bash
pnpm db:reset
# Rattacher un financeur à un dossier de seed déclenche l'event ; puis :
curl -s "http://localhost:54321/functions/v1/dispatch?secret=$CRON_SECRET" \
  || curl -s -X POST "http://localhost:3000/api/cron/dispatch-events?secret=test" # selon montage local
```
Expected: réponse JSON avec `dispatched >= 1` après qu'un `dossier.funder_attached` a été émis. (Si l'environnement local ne permet pas le cron HTTP, valider via la Task 9 qui appelle la RPC directement.)

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/api/cron/dispatch-events/route.ts
git commit -m "feat(financeurs): handler dispatch materialize-funder-playbook"
```

---

### Task 9: Server Actions — préparer le brouillon + envoyer

**Files:**
- Create: `apps/web/app/(dashboard)/dossiers/[id]/financeurs/actions.ts`

- [ ] **Step 1: Écrire les Server Actions**

```ts
'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@supabase/supabase-js';
import { env } from '@/env.mjs';
import { sendEmail, type EmailAttachment } from '@/shared/lib/email/resend';
import { funderEmail } from '@/shared/lib/email/templates'; // wrapper serveur (Task 7)
import { decideTransport } from '@/shared/lib/funders/attachments';

const admin = () =>
  createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

type ActionResult = { ok: true } | { ok: false; error: string };

type StepRow = {
  email_subject_template: string;
  email_body_template: string;
  required_document_kinds: string[];
  reference_document_codes: string[];
};

type ResolvedAtt = { filename: string; storage_path: string; bytes: number };

// Résout les documents du dossier (par kind) + les CCN (par code) en chemins storage.
async function resolveAttachments(
  sb: ReturnType<typeof admin>,
  orgId: string,
  dossierId: string,
  step: StepRow,
): Promise<ResolvedAtt[]> {
  const out: ResolvedAtt[] = [];

  if (step.required_document_kinds.length > 0) {
    const { data: docs } = await sb
      .schema('app')
      .from('documents')
      .select('title, kind, storage_path, file_size_bytes, status')
      .eq('dossier_id', dossierId)
      .in('kind', step.required_document_kinds)
      .eq('status', 'ready');
    for (const d of (docs ?? []) as Array<{ title: string; storage_path: string | null; file_size_bytes: number | null }>) {
      if (d.storage_path) out.push({ filename: `${d.title}.pdf`, storage_path: d.storage_path, bytes: d.file_size_bytes ?? 0 });
    }
  }

  if (step.reference_document_codes.length > 0) {
    const { data: ccn } = await sb
      .schema('app')
      .from('document_templates')
      .select('code, title, current_version, document_template_versions(version, storage_path)')
      .eq('kind', 'convention_collective')
      .in('code', step.reference_document_codes)
      .or(`organization_id.eq.${orgId},organization_id.is.null`);
    for (const t of (ccn ?? []) as Array<{ title: string; current_version: number; document_template_versions: Array<{ version: number; storage_path: string }> }>) {
      const v = t.document_template_versions?.find((x) => x.version === t.current_version) ?? t.document_template_versions?.[0];
      if (v?.storage_path) out.push({ filename: `${t.title}.pdf`, storage_path: v.storage_path, bytes: 0 });
    }
  }

  return out;
}

export async function prepareFunderTaskDraft(taskId: string, dossierId: string): Promise<ActionResult> {
  const sb = admin();

  const { data: task } = await sb
    .schema('app').from('dossier_funder_tasks')
    .select('id, organization_id, dossier_id, funder_id, playbook_step_id, status')
    .eq('id', taskId).maybeSingle();
  if (!task) return { ok: false, error: 'Tâche introuvable' };
  const t = task as { organization_id: string; dossier_id: string; funder_id: string; playbook_step_id: string };

  const { data: step } = await sb
    .schema('app').from('funder_playbook_steps')
    .select('email_subject_template, email_body_template, required_document_kinds, reference_document_codes')
    .eq('id', t.playbook_step_id).maybeSingle();
  if (!step) return { ok: false, error: 'Étape de playbook introuvable' };

  const { data: dossier } = await sb
    .schema('app').from('dossiers')
    .select('title, start_date, end_date, organization_id')
    .eq('id', t.dossier_id).maybeSingle();
  const { data: org } = await sb
    .schema('app').from('organizations').select('name').eq('id', t.organization_id).maybeSingle();

  const d = (dossier ?? {}) as { title?: string; start_date?: string; end_date?: string };
  const vars: Record<string, string> = {
    stagiaire: d.title ?? '',
    dossier: d.title ?? '',
    date_debut: d.start_date ?? '',
    date_fin: d.end_date ?? '',
    organisme: (org as { name?: string } | null)?.name ?? '',
  };

  const rendered = funderEmail(
    { subjectTemplate: (step as StepRow).email_subject_template, bodyTemplate: (step as StepRow).email_body_template },
    vars,
  ); // -> { subject, html } déjà enveloppé dans la mise en page commune

  const resolved = await resolveAttachments(sb, t.organization_id, t.dossier_id, step as StepRow);
  const transport = decideTransport(resolved.map((r) => r.bytes));

  await sb.schema('app').from('dossier_funder_tasks').update({
    draft_subject: rendered.subject,
    draft_html: rendered.html,
    resolved_attachments: resolved.map((r) => ({ ...r, transport })),
    status: 'drafted',
    updated_at: new Date().toISOString(),
  }).eq('id', taskId);

  revalidatePath(`/dossiers/${dossierId}`);
  return { ok: true };
}

export async function sendFunderTask(taskId: string, dossierId: string): Promise<ActionResult> {
  const sb = admin();

  const { data: task } = await sb
    .schema('app').from('dossier_funder_tasks')
    .select('id, organization_id, dossier_id, funder_id, draft_subject, draft_html, resolved_attachments, status')
    .eq('id', taskId).maybeSingle();
  if (!task) return { ok: false, error: 'Tâche introuvable' };
  const t = task as {
    organization_id: string; dossier_id: string; funder_id: string;
    draft_subject: string | null; draft_html: string | null;
    resolved_attachments: Array<{ filename: string; storage_path: string; bytes: number; transport: string }>;
  };
  if (!t.draft_subject || !t.draft_html) return { ok: false, error: 'Brouillon non préparé' };

  const { data: funder } = await sb
    .schema('app').from('funders').select('contact_email, name').eq('id', t.funder_id).maybeSingle();
  const to = (funder as { contact_email?: string } | null)?.contact_email;
  if (!to) return { ok: false, error: 'Financeur sans email de contact' };

  // Construit les pièces jointes : base64 si transport=attach, sinon lien signé.
  const attachments: EmailAttachment[] = [];
  const links: string[] = [];
  for (const a of t.resolved_attachments) {
    if (a.transport === 'attach') {
      const { data: blob } = await sb.storage.from('documents').download(a.storage_path);
      if (blob) {
        const buf = Buffer.from(await blob.arrayBuffer());
        attachments.push({ filename: a.filename, content: buf.toString('base64') });
      }
    } else {
      const { data: signed } = await sb.storage.from('documents').createSignedUrl(a.storage_path, 60 * 60 * 24 * 7);
      if (signed?.signedUrl) links.push(`<li><a href="${signed.signedUrl}">${a.filename}</a></li>`);
    }
  }
  const html = links.length
    ? `${t.draft_html}<p>Documents volumineux (liens valables 7 jours) :</p><ul>${links.join('')}</ul>`
    : t.draft_html;

  const res = await sendEmail({ to, subject: t.draft_subject, html, attachments });
  if (!res.ok) return { ok: false, error: `Envoi échoué (${res.reason})` };

  await sb.schema('app').from('dossier_funder_tasks').update({
    status: 'sent', sent_at: new Date().toISOString(), resend_message_id: res.id, updated_at: new Date().toISOString(),
  }).eq('id', taskId);

  // Trace l'envoi dans l'outbox pour les abonnés en aval.
  await sb.schema('infra').from('domain_events').insert({
    organization_id: t.organization_id, aggregate_type: 'dossier', aggregate_id: t.dossier_id,
    type: 'dossier.funder_document_sent',
    payload: { task_id: taskId, funder_id: t.funder_id, message_id: res.id },
  });

  revalidatePath(`/dossiers/${dossierId}`);
  return { ok: true };
}
```

> **Vérifs avant d'écrire** : (1) confirmer la relation `document_template_versions` (table `app.document_template_versions`, colonnes `version`, `storage_path`) — déjà présente migration 0009. (2) `sb.storage.from(...)` est dispo sur le client supabase-js standard. (3) `app.organizations` a bien une colonne `name` (`grep -n "CREATE TABLE app.organizations" -A15 supabase/migrations/*.sql`). (4) Le champ `stagiaire` est ici mappé sur `dossiers.title` faute de modèle apprenant unique par dossier — si un apprenant principal existe, le brancher.

- [ ] **Step 2: Typecheck + lint**

Run: `pnpm typecheck && pnpm lint`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add "apps/web/app/(dashboard)/dossiers/[id]/financeurs/actions.ts"
git commit -m "feat(financeurs): server actions préparer brouillon + envoyer"
```

---

### Task 10: UI — section Financeurs dans la page dossier

**Files:**
- Create: `apps/web/app/(dashboard)/dossiers/[id]/financeurs/_components/funder-tasks-section.tsx`
- Modify: `apps/web/app/(dashboard)/dossiers/[id]/page.tsx`

- [ ] **Step 1: Composant section (server component + form actions)**

```tsx
// apps/web/app/(dashboard)/dossiers/[id]/financeurs/_components/funder-tasks-section.tsx
import { prepareFunderTaskDraft, sendFunderTask } from '../actions';

type Task = {
  id: string;
  due_date: string | null;
  status: string;
  draft_subject: string | null;
  funder_name: string;
  resolved_attachments: Array<{ filename: string; transport: string }>;
};

const STATUS_LABEL: Record<string, string> = {
  pending: 'À préparer', ready: 'Échéance proche', drafted: 'Brouillon prêt',
  sent: 'Envoyé', done: 'Terminé', skipped: 'Ignoré',
};

export function FunderTasksSection({ dossierId, tasks }: { dossierId: string; tasks: Task[] }) {
  if (tasks.length === 0) {
    return <section className="rounded-lg border p-4"><h2 className="font-semibold">Financeurs</h2><p className="text-sm text-muted-foreground">Aucune tâche financeur. Rattachez un financeur au dossier pour générer le calendrier d'envoi.</p></section>;
  }
  return (
    <section className="rounded-lg border p-4 space-y-3">
      <h2 className="font-semibold">Financeurs — documents à transmettre</h2>
      <ul className="space-y-2">
        {tasks.map((t) => (
          <li key={t.id} className="flex items-center justify-between gap-4 rounded border p-3">
            <div className="min-w-0">
              <div className="font-medium">{t.funder_name}</div>
              <div className="text-sm text-muted-foreground">
                {STATUS_LABEL[t.status] ?? t.status}
                {t.due_date ? ` · échéance ${new Date(t.due_date).toLocaleDateString('fr-FR')}` : ''}
                {t.resolved_attachments.length ? ` · ${t.resolved_attachments.length} pièce(s)` : ''}
              </div>
              {t.draft_subject && <div className="truncate text-sm">Objet : {t.draft_subject}</div>}
            </div>
            <div className="flex gap-2">
              {t.status !== 'sent' && t.status !== 'done' && (
                <form action={async () => { 'use server'; await prepareFunderTaskDraft(t.id, dossierId); }}>
                  <button className="rounded bg-secondary px-3 py-1 text-sm" type="submit">Préparer</button>
                </form>
              )}
              {t.status === 'drafted' && (
                <form action={async () => { 'use server'; await sendFunderTask(t.id, dossierId); }}>
                  <button className="rounded bg-primary px-3 py-1 text-sm text-primary-foreground" type="submit">Envoyer</button>
                </form>
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
```

> Aligner les classes CSS sur le design system réel de la page dossier (regarder les sections existantes dans `page.tsx`). Si le repo n'utilise pas ces tokens (`bg-primary`, etc.), copier les classes d'un bouton existant.

- [ ] **Step 2: Charger les tâches et monter la section dans `page.tsx`**

Dans `apps/web/app/(dashboard)/dossiers/[id]/page.tsx`, après le chargement existant du dossier, ajouter la requête et le rendu :

```tsx
// imports en tête de fichier
import { FunderTasksSection } from './financeurs/_components/funder-tasks-section';

// dans le composant page, avec le client supabase serveur déjà utilisé (sb) :
const { data: funderTasks } = await sb
  .schema('app')
  .from('dossier_funder_tasks')
  .select('id, due_date, status, draft_subject, resolved_attachments, funders(name)')
  .eq('dossier_id', params.id)
  .order('due_date', { ascending: true });

const tasksForUi = (funderTasks ?? []).map((t: any) => ({
  id: t.id, due_date: t.due_date, status: t.status, draft_subject: t.draft_subject,
  funder_name: t.funders?.name ?? 'Financeur', resolved_attachments: t.resolved_attachments ?? [],
}));

// dans le JSX, à l'endroit voulu :
<FunderTasksSection dossierId={params.id} tasks={tasksForUi} />
```

> **Vérifs** : regarder comment `page.tsx` instancie son client supabase (variable `sb`/`supabase`) et la forme de `params` (`params.id` vs `params` async Next 14). Adapter. Si la jointure `funders(name)` échoue (FK non détectée par PostgREST), faire une 2e requête sur `app.funders`.

- [ ] **Step 3: Build + lint**

Run: `pnpm lint && pnpm build`
Expected: build OK (la page compile, le composant est monté).

- [ ] **Step 4: Commit**

```bash
git add "apps/web/app/(dashboard)/dossiers/[id]/financeurs/_components/funder-tasks-section.tsx" "apps/web/app/(dashboard)/dossiers/[id]/page.tsx"
git commit -m "feat(financeurs): section Financeurs (préparer/envoyer) dans la page dossier"
```

---

### Task 11: Régénération des types + vérification finale

**Files:**
- Modify: `apps/web/shared/types/database.ts` (généré)

- [ ] **Step 1: Régénérer les types**

Run: `pnpm db:reset && pnpm db:types`
Expected: `database.ts` contient `funder_playbooks`, `funder_playbook_steps`, `dossier_funder_tasks`.

- [ ] **Step 2: Suite complète**

Run: `pnpm db:test && pnpm test && pnpm typecheck && pnpm lint && pnpm build`
Expected: tout PASS (pgTAP 0047 vert, Vitest vert, typecheck/lint/build OK).

- [ ] **Step 3: Vérification fonctionnelle bout-en-bout (manuelle)**

1. `pnpm dev`, rattacher un financeur OPCO à un dossier de seed.
2. Déclencher le cron dispatch (cf. Task 8) ou attendre 1 min en prod.
3. Ouvrir la page dossier → la section Financeurs liste 2 tâches OPCO avec échéances.
4. « Préparer » → statut passe à « Brouillon prêt », objet rempli.
5. « Envoyer » (avec `RESEND_API_KEY` configurée) → statut « Envoyé », email reçu avec PJ.

Expected: chaque étape se comporte comme décrit.

- [ ] **Step 4: Commit**

```bash
git add apps/web/shared/types/database.ts
git commit -m "chore(financeurs): régénère les types DB"
```

---

## Self-Review

**Spec coverage :**
- Bibliothèque système + override → Task 2 (idiome `organization_id NULL`/`is_system`), résolution Task 4 RPC, testé Task 4 pgTAP.
- Calendrier relatif (ancre + offset) → enum `funder_step_anchor` Task 2, calcul `due_date` Task 4, testé Task 4.
- CCN = PDF joint → kind `convention_collective` Task 4, résolution attachments Task 9.
- Brouillon assisté + envoi 1 clic → Server Actions Task 9, UI Task 10.
- PJ par défaut, fallback lien → `decideTransport` Task 7, branche attach/lien Task 9.
- Outbox/cron → trigger Task 4, handler Task 8.
- RLS + tests → Tasks 2/3 RLS, Task 4 pgTAP, Task 7 Vitest, Task 11 suite complète.
- Extension enum funder_kind (faf_ca, agefiph) → Task 1.

**Points à confirmer pendant l'exécution (non bloquants, signalés inline) :** nom du helper RLS d'org ; exposition PostgREST de la RPC (wrapper public si besoin) ; helpers pgTAP réels ; mapping `stagiaire` (titre dossier vs apprenant principal) ; tokens CSS du design system.

**Hors scope (phase 2) :** configurateur UI des playbooks, envoi 100 % auto, accusés de réception, détection IDCC depuis l'employeur.
