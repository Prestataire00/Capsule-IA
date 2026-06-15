# Effacement RGPD (anonymisation apprenants + prospects) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permettre à un admin/owner d'anonymiser atomiquement et de façon journalisée les données personnelles d'un apprenant ou d'un prospect, tout en conservant les enregistrements à valeur légale (émargements, conventions) pseudonymisés.

**Architecture:** Une fonction Postgres `SECURITY DEFINER` par type de personne (`app.anonymize_learner`, `app.anonymize_prospect`) effectue tout le scrub multi-tables en **une transaction**, re-vérifie les gardes (rôle owner/admin, isolation org, dossier actif) via les claims JWT, écrit une entrée `audit.audit_log`, et **retourne les chemins storage** à supprimer. Un Server Action `next-safe-action` (admin-only, Zod partagé) appelle la RPC via le client authentifié (RLS-claims) puis supprime les blobs storage en best-effort.

**Tech Stack:** Postgres/Supabase (RLS, SECURITY DEFINER, pgTAP), Next.js 14 App Router, next-safe-action, Zod, Vitest, TypeScript strict.

**Spec de référence :** `docs/superpowers/specs/2026-06-15-rgpd-effacement-design.md`

---

## Contexte codebase (à lire avant de commencer)

- **Helpers SQL** (déjà en place) : `app.is_admin_or_owner()` (owner/admin), `app.current_organization_id()`, `app.current_user_id()` (= `auth.uid()`), `app.current_role()` — `supabase/migrations/0018_rls_helpers.sql` + `0001_extensions_and_helpers.sql`.
- **Claims JWT** injectés par `0042_auth_hook.sql` : `organization_id`, `role`, `member_id`, `sub`.
- **Audit** : table `audit.audit_log(organization_id, actor_user_id, actor_ip, actor_user_agent, schema_name, table_name, row_id, action CHECK(insert|update|delete), before jsonb, after jsonb, diff jsonb, occurred_at)` — `0023_rls_billing_infra_audit.sql`.
- **safe-action** : `authActionClient` dans `apps/web/shared/lib/safe-action.ts`. `ctx = { userId, email, supabase }` où `ctx.supabase` est le client **authentifié** (porte les claims JWT). `supabaseAdmin()` (service_role, **bypass RLS**, sans claims) dans `apps/web/shared/lib/supabase/admin.ts` — son commentaire autorise explicitement « anonymisation RGPD ».
- **Pattern action+rpc** : `apps/web/app/(dashboard)/dossiers/[id]/qualiopi/actions.ts` (`.rpc('name', { p_param })`, `if (error) return { ok:false, error }`). Type résultat : `type ActionResult = { ok: true } | { ok: false; error: string }`.
- **Zod partagé** : `apps/web/app/(dashboard)/prospects/convert-schema.ts` + usage `.schema(...)` dans `actions.ts`.
- **Confirmation destructive** (pattern à copier, pas de shadcn AlertDialog dans le repo) : `apps/web/app/(dashboard)/parametres/securite/mfa/_components/disable-mfa-button.tsx` (état `confirm`/`pending` + `useTransition`).
- **pgTAP** : helper `tests.set_jwt(p_org uuid, p_role text, p_user_id uuid, p_member_id uuid DEFAULT NULL)` + `tests.as_service_role()` / `tests.as_authenticated()` — `supabase/tests/_helpers.sql`. Exemple complet : `supabase/tests/0045_test_rls_by_role_learners.sql`.
- **⚠️ Vérification locale** : `pnpm db:reset` / `db:test` exigent Docker/Supabase local (souvent indisponible) → migrations + pgTAP en **mode write-only, validés en CI**. `pnpm typecheck` n'est jamais 100% vert (~51 erreurs pré-existantes `@/env.mjs`) → critère = **aucune NOUVELLE erreur dans les fichiers touchés**. Valider le TS via `pnpm --filter web build` si besoin.
- **⚠️ Numéro de migration** : `0085` est le dernier connu sur `origin/main` (collisions fréquentes via merges parallèles). Le numéro réel = **(dernier sur `origin/main`) + 1 au moment du push** — re-vérifier à ce moment-là. Ce plan utilise `0086` comme **placeholder de travail** ; renuméroter au push si besoin.

---

## File Structure

| Fichier | Responsabilité | Action |
|---|---|---|
| `supabase/migrations/0086_rgpd_anonymization.sql` | `prospects.anonymized_at` + fonctions `anonymize_learner`/`anonymize_prospect` + grants | Create |
| `supabase/tests/0086_test_rgpd_anonymization.sql` | pgTAP : gardes + scrub + audit + idempotence | Create |
| `apps/web/app/(dashboard)/rgpd/rgpd-schema.ts` | Zod partagé `AnonymizeLearnerSchema` / `AnonymizeProspectSchema` | Create |
| `apps/web/app/(dashboard)/rgpd/name-match.ts` | Helper pur `namesMatch(input, actual)` (pur, testable) | Create |
| `apps/web/app/(dashboard)/rgpd/name-match.test.ts` | Vitest helper + schémas | Create |
| `apps/web/app/(dashboard)/rgpd/rgpd-actions.ts` | Server Actions `anonymizeLearner`/`anonymizeProspect` + `resolveOwnerAdminOrgId` + storage cleanup + mapping erreurs | Create |
| `apps/web/app/(dashboard)/rgpd/anonymize-action.tsx` | Composant client : bouton + confirmation par saisie du nom | Create |
| `apps/web/app/(dashboard)/apprenants/page.tsx` | Brancher l'action (colonne admin-only) | Modify |
| `apps/web/app/(dashboard)/prospects/page.tsx` | Brancher l'action (colonne admin-only) + avertissement « converti » | Modify |
| `docs/coordination/CLAIMS.md` | Claim de la zone RGPD | Modify |

> Les fichiers app vivent dans un dossier dédié `(dashboard)/rgpd/` (cohésion par responsabilité : tout l'effacement RGPD au même endroit), importés par les deux pages liste.

---

## Task 0: Worktree + claim de coordination

**Files:**
- Modify: `docs/coordination/CLAIMS.md`

- [ ] **Step 1: Brancher depuis origin/main à jour + worktree isolé**

```bash
cd /Users/anissa/i-a-infinity-of
git fetch origin
git switch -C feature/rgpd-effacement origin/main
git worktree add .worktrees/rgpd-effacement feature/rgpd-effacement 2>/dev/null || true
cd .worktrees/rgpd-effacement
pnpm install
```

(Si `.worktrees/` n'existe pas encore, le créer ; il est déjà gitignoré.)

- [ ] **Step 2: Claimer la zone dans CLAIMS.md**

Ajouter cette ligne dans le tableau « Claims actifs » de `docs/coordination/CLAIMS.md` :

```markdown
| Opus (rgpd) | Effacement RGPD (anonymisation apprenants+prospects) : migration 0086 (`anonymize_learner`/`anonymize_prospect` + `prospects.anonymized_at`), `app/(dashboard)/rgpd/**`, branchement boutons listes apprenants/prospects. **Transverse PII** (lecture seule des autres zones). | feature/rgpd-effacement | 2026-06-15 | en cours |
```

- [ ] **Step 3: Commit + push le claim**

```bash
git add docs/coordination/CLAIMS.md
git commit -m "chore(coordination): claim effacement RGPD (anonymisation)"
git push -u origin feature/rgpd-effacement
```

---

## Task 1: Migration — colonne + fonctions d'anonymisation

**Files:**
- Create: `supabase/migrations/0086_rgpd_anonymization.sql`

> ⚠️ Pas de test local possible (Docker) → write-only, validé en CI. Le test pgTAP est la Task 2.

- [ ] **Step 1: Écrire la migration complète**

Créer `supabase/migrations/0086_rgpd_anonymization.sql` avec exactement :

```sql
-- 0086_rgpd_anonymization.sql
-- Droit à l'effacement RGPD : anonymisation en place (apprenants + prospects).
-- Scrub des identifiants directs + métadonnées de surveillance ; conservation des
-- enregistrements à valeur légale (émargements, conventions) pseudonymisés.
-- ERRCODE custom : P0401 (forbidden), P0404 (not found / autre org), P0409 (dossier actif).

-- 1. Marqueur d'anonymisation sur les prospects (existe déjà sur app.learners).
ALTER TABLE app.prospects ADD COLUMN IF NOT EXISTS anonymized_at TIMESTAMPTZ NULL;

-- 2. Anonymisation d'un apprenant.
CREATE OR REPLACE FUNCTION app.anonymize_learner(p_learner_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, audit, pg_temp
AS $$
DECLARE
  v_org        UUID;
  v_user_id    UUID;
  v_old_email  CITEXT;
  v_already    TIMESTAMPTZ;
  v_paths      TEXT[] := '{}';
  v_before     JSONB;
BEGIN
  -- Garde rôle : owner/admin uniquement.
  IF NOT app.is_admin_or_owner() THEN
    RAISE EXCEPTION 'forbidden: admin/owner requis' USING ERRCODE = 'P0401';
  END IF;

  -- Charger la ligne, scoper à l'org du JWT (isolation cross-tenant).
  SELECT organization_id, user_id, email, anonymized_at
    INTO v_org, v_user_id, v_old_email, v_already
  FROM app.learners
  WHERE id = p_learner_id
    AND organization_id = app.current_organization_id()
    AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'not found' USING ERRCODE = 'P0404';
  END IF;

  -- Idempotence : déjà anonymisé → no-op.
  IF v_already IS NOT NULL THEN
    RETURN jsonb_build_object('status', 'already_anonymized', 'anonymized_at', v_already);
  END IF;

  -- Garde dossier actif : interdit tant qu'une formation est en cours.
  IF EXISTS (
    SELECT 1 FROM app.dossiers
    WHERE learner_id = p_learner_id AND status = 'active' AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'active dossier' USING ERRCODE = 'P0409';
  END IF;

  -- Snapshot PII avant scrub (pour l'audit).
  SELECT to_jsonb(l) - 'metadata' INTO v_before FROM app.learners l WHERE l.id = p_learner_id;

  -- Collecte des chemins storage à supprimer (exercices) AVANT de les nullifier.
  SELECT array_agg(file_path) INTO v_paths
  FROM app.exercise_submissions
  WHERE learner_id = p_learner_id AND file_path IS NOT NULL;

  -- 2a. Scrub du root learner.
  UPDATE app.learners SET
    first_name          = 'Apprenant',
    last_name           = 'anonymisé #' || substr(id::text, 1, 8),
    email               = ('anon+' || id::text || '@anonymized.invalid')::citext,
    phone               = NULL,
    birth_date          = NULL,
    birth_place         = NULL,
    nationality         = NULL,
    gender              = NULL,
    address             = '{}'::jsonb,
    position            = NULL,
    education_level     = NULL,
    cpf_number          = NULL,
    rqth                = false,
    accessibility_notes = NULL,
    notes               = NULL,
    tags                = '{}',
    metadata            = '{}'::jsonb,
    user_id             = NULL,
    anonymized_at       = now(),
    updated_at          = now()
  WHERE id = p_learner_id;

  -- 2b. Émargements : nullify métadonnées de surveillance, GARDE la preuve (image/hash/signed_at).
  UPDATE app.attendance_signatures SET
    signer_ip         = NULL,
    signer_user_agent = NULL,
    signer_country    = NULL,
    notes             = NULL
  WHERE learner_id = p_learner_id;

  -- 2c. Signatures de documents : nullify IP/UA, GARDE signer_name/email/image (contrat exécuté).
  UPDATE app.document_signatures SET
    signer_ip         = NULL,
    signer_user_agent = NULL
  WHERE signer_learner_id = p_learner_id;

  -- 2d. Questionnaires : nullify identifiants destinataire + IP/UA de soumission.
  UPDATE app.questionnaire_assignments SET
    recipient_email = NULL,
    recipient_name  = NULL
  WHERE recipient_learner_id = p_learner_id;

  UPDATE app.questionnaire_responses SET
    submitter_ip         = NULL,
    submitter_user_agent = NULL
  WHERE assignment_id IN (
    SELECT id FROM app.questionnaire_assignments WHERE recipient_learner_id = p_learner_id
  );

  -- 2e. Réclamations : nullify l'identité du rapporteur (garde la réclamation).
  UPDATE app.complaints SET
    reporter_name  = NULL,
    reporter_email = NULL
  WHERE learner_id = p_learner_id;

  -- 2f. Logs d'accès ressources : nullify IP/UA.
  UPDATE app.resource_access_log SET
    ip         = NULL,
    user_agent = NULL
  WHERE learner_id = p_learner_id;

  -- 2f-bis. Logs d'accès documents : mappés via l'ancien user_id de l'apprenant (s'il existait).
  IF v_user_id IS NOT NULL THEN
    UPDATE app.document_access_log SET
      ip         = NULL,
      user_agent = NULL
    WHERE actor_user_id = v_user_id;
  END IF;

  -- 2g. Soumissions d'exercices : retirer la référence fichier (blob supprimé côté action).
  --     COALESCE garantit le respect du CHECK (content IS NOT NULL OR file_path IS NOT NULL).
  UPDATE app.exercise_submissions SET
    content   = COALESCE(content, '(soumission anonymisée)'),
    file_path = NULL
  WHERE learner_id = p_learner_id;

  -- 2h. Logs email transactionnels : nullify destinataire + metadata.
  UPDATE app.email_log SET
    recipient = 'anonymized@anonymized.invalid',
    metadata  = '{}'::jsonb
  WHERE organization_id = v_org AND recipient = v_old_email::text;

  -- 2i. Notifications (transient, sans valeur légale) : suppression.
  DELETE FROM app.notifications
  WHERE organization_id = v_org
    AND (recipient_email = v_old_email
         OR (v_user_id IS NOT NULL AND recipient_user_id = v_user_id));

  -- 3. Journalisation.
  INSERT INTO audit.audit_log(organization_id, actor_user_id, schema_name, table_name, row_id, action, before, after, diff)
  VALUES (
    v_org, app.current_user_id(), 'app', 'learners', p_learner_id, 'update',
    v_before,
    jsonb_build_object('anonymized', true, 'at', now()),
    jsonb_build_object('reason', 'rgpd_erasure')
  );

  RETURN jsonb_build_object('status', 'anonymized', 'storage_paths', to_jsonb(COALESCE(v_paths, '{}')));
END $$;

-- 4. Anonymisation d'un prospect.
CREATE OR REPLACE FUNCTION app.anonymize_prospect(p_prospect_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, audit, pg_temp
AS $$
DECLARE
  v_org      UUID;
  v_already  TIMESTAMPTZ;
  v_docs     JSONB;
  v_paths    TEXT[] := '{}';
  v_before   JSONB;
BEGIN
  IF NOT app.is_admin_or_owner() THEN
    RAISE EXCEPTION 'forbidden: admin/owner requis' USING ERRCODE = 'P0401';
  END IF;

  SELECT organization_id, anonymized_at, documents
    INTO v_org, v_already, v_docs
  FROM app.prospects
  WHERE id = p_prospect_id
    AND organization_id = app.current_organization_id()
    AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'not found' USING ERRCODE = 'P0404';
  END IF;

  IF v_already IS NOT NULL THEN
    RETURN jsonb_build_object('status', 'already_anonymized', 'anonymized_at', v_already);
  END IF;

  -- Collecte des chemins storage des documents prospect.
  SELECT array_agg(d->>'storage_path') INTO v_paths
  FROM jsonb_array_elements(COALESCE(v_docs, '[]'::jsonb)) d
  WHERE d ? 'storage_path';

  SELECT to_jsonb(p) - 'internal_notes' INTO v_before FROM app.prospects p WHERE p.id = p_prospect_id;

  UPDATE app.prospects SET
    civility       = NULL,
    first_name     = 'Prospect',
    last_name      = 'anonymisé #' || substr(id::text, 1, 8),
    email          = 'anon+' || id::text || '@anonymized.invalid',
    phone          = NULL,
    birth_date     = NULL,
    rqth           = false,
    message        = NULL,
    company_name   = NULL,
    internal_notes = NULL,
    source         = NULL,
    ip_address     = NULL,
    user_agent     = NULL,
    documents      = '[]'::jsonb,
    anonymized_at  = now(),
    updated_at     = now()
  WHERE id = p_prospect_id;

  INSERT INTO audit.audit_log(organization_id, actor_user_id, schema_name, table_name, row_id, action, before, after, diff)
  VALUES (
    v_org, app.current_user_id(), 'app', 'prospects', p_prospect_id, 'update',
    v_before,
    jsonb_build_object('anonymized', true, 'at', now()),
    jsonb_build_object('reason', 'rgpd_erasure')
  );

  RETURN jsonb_build_object('status', 'anonymized', 'storage_paths', to_jsonb(COALESCE(v_paths, '{}')));
END $$;

-- 5. Exécution réservée aux utilisateurs authentifiés (gardes internes au corps des fonctions).
REVOKE ALL ON FUNCTION app.anonymize_learner(UUID) FROM public;
REVOKE ALL ON FUNCTION app.anonymize_prospect(UUID) FROM public;
GRANT EXECUTE ON FUNCTION app.anonymize_learner(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION app.anonymize_prospect(UUID) TO authenticated;
```

- [ ] **Step 2: Vérifier la syntaxe SQL localement (parse only)**

Si `psql` dispo en local sans DB : `pg_validate` n'existe pas → faute de Docker, **inspection visuelle** + s'appuyer sur la Task 2 (pgTAP CI). Vérifier au minimum : colonnes citées présentes dans les DDL (cf. spec §4 / migrations sources), pas de virgule finale, `$$` équilibrés.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0086_rgpd_anonymization.sql
git commit -m "feat(rgpd): fonctions d'anonymisation learner/prospect (migration 0086)"
```

---

## Task 2: pgTAP — gardes, scrub, audit, idempotence

**Files:**
- Create: `supabase/tests/0086_test_rgpd_anonymization.sql`

> Tourne en CI sur vraie Supabase. Localement uniquement si Docker dispo (`pnpm db:test`).

- [ ] **Step 1: Écrire le test pgTAP complet**

Créer `supabase/tests/0086_test_rgpd_anonymization.sql` :

```sql
BEGIN;
SELECT plan(8);

SELECT tests.as_service_role();

-- Org A + org B (cross-tenant).
INSERT INTO app.organizations (id, name, legal_name, siret) VALUES
  ('00aaa000-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'OF A', 'OF A SARL', '11111111111111'),
  ('00bbb000-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'OF B', 'OF B SARL', '22222222222222');

INSERT INTO auth.users (id, email, instance_id, aud, role) VALUES
  ('admin-00a-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'admin-a@of.test', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('gest-00a0-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'gest-a@of.test',  '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('admin-00b-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'admin-b@of.test', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

INSERT INTO app.profiles (user_id, full_name, email) VALUES
  ('admin-00a-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Admin A', 'admin-a@of.test'),
  ('gest-00a0-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Gest A',  'gest-a@of.test'),
  ('admin-00b-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Admin B', 'admin-b@of.test');

INSERT INTO app.members (organization_id, user_id, role, is_default_org) VALUES
  ('00aaa000-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'admin-00a-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'admin'::app.member_role, true),
  ('00aaa000-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'gest-00a0-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'gestionnaire'::app.member_role, true),
  ('00bbb000-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'admin-00b-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'admin'::app.member_role, true);

-- Apprenants : l'un avec dossier actif, l'un clôturé.
INSERT INTO app.learners (id, organization_id, first_name, last_name, email, phone) VALUES
  ('1ea50001-0000-0000-0000-000000000001', '00aaa000-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Alice', 'Durand', 'alice@test.com', '0600000000'),
  ('1ea50002-0000-0000-0000-000000000002', '00aaa000-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Bob',   'Martin', 'bob@test.com',   '0611111111');

-- Dossier actif pour Alice (bloque), aucun dossier actif pour Bob.
INSERT INTO app.dossiers (id, organization_id, learner_id, status)
VALUES ('d0550001-0000-0000-0000-000000000001', '00aaa000-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '1ea50001-0000-0000-0000-000000000001', 'active');

-- Test 1 : non-admin (gestionnaire) → P0401.
SELECT tests.set_jwt('00aaa000-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'gestionnaire', 'gest-00a0-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
SELECT tests.as_authenticated();
SELECT throws_ok(
  $$ SELECT app.anonymize_learner('1ea50002-0000-0000-0000-000000000002') $$,
  'P0401', NULL, 'gestionnaire : anonymize_learner refusé (P0401)'
);

-- Test 2 : admin d'une autre org → P0404 (isolation cross-tenant).
SELECT tests.set_jwt('00bbb000-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'admin', 'admin-00b-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
SELECT tests.as_authenticated();
SELECT throws_ok(
  $$ SELECT app.anonymize_learner('1ea50002-0000-0000-0000-000000000002') $$,
  'P0404', NULL, 'admin autre org : not found (P0404)'
);

-- Test 3 : apprenant avec dossier actif → P0409.
SELECT tests.set_jwt('00aaa000-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'admin', 'admin-00a-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
SELECT tests.as_authenticated();
SELECT throws_ok(
  $$ SELECT app.anonymize_learner('1ea50001-0000-0000-0000-000000000001') $$,
  'P0409', NULL, 'dossier actif : anonymisation bloquée (P0409)'
);

-- Test 4 : golden path sur Bob (admin, pas de dossier actif).
SELECT lives_ok(
  $$ SELECT app.anonymize_learner('1ea50002-0000-0000-0000-000000000002') $$,
  'admin : anonymisation Bob OK'
);

-- Test 5 : PII scrubbée + anonymized_at posé.
SELECT tests.as_service_role();
SELECT is(
  (SELECT first_name || '|' || COALESCE(phone, 'NULL') || '|' || (anonymized_at IS NOT NULL)::text
   FROM app.learners WHERE id = '1ea50002-0000-0000-0000-000000000002'),
  'Apprenant|NULL|true',
  'Bob : prénom anonymisé, téléphone nullifié, anonymized_at posé'
);

-- Test 6 : entrée d'audit écrite.
SELECT is(
  (SELECT count(*)::int FROM audit.audit_log
   WHERE table_name = 'learners' AND row_id = '1ea50002-0000-0000-0000-000000000002' AND action = 'update'),
  1,
  'audit : 1 entrée pour l''anonymisation de Bob'
);

-- Test 7 : idempotence (ré-appel → already_anonymized, pas de 2e audit).
SELECT tests.set_jwt('00aaa000-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'admin', 'admin-00a-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
SELECT tests.as_authenticated();
SELECT is(
  (SELECT app.anonymize_learner('1ea50002-0000-0000-0000-000000000002') ->> 'status'),
  'already_anonymized',
  'ré-appel : already_anonymized (idempotent)'
);

-- Test 8 : prospect anonymisé.
SELECT tests.as_service_role();
INSERT INTO app.prospects (id, organization_id, first_name, last_name, email, situation, funder_kind, status)
VALUES ('9805c001-0000-0000-0000-000000000001', '00aaa000-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Carla', 'Petit', 'carla@test.com',
        (SELECT enumlabel::app.prospect_situation FROM pg_enum e JOIN pg_type t ON t.oid=e.enumtypid WHERE t.typname='prospect_situation' LIMIT 1),
        (SELECT enumlabel::app.funder_kind FROM pg_enum e JOIN pg_type t ON t.oid=e.enumtypid WHERE t.typname='funder_kind' LIMIT 1),
        'new');
SELECT tests.set_jwt('00aaa000-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'admin', 'admin-00a-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
SELECT tests.as_authenticated();
SELECT app.anonymize_prospect('9805c001-0000-0000-0000-000000000001');
SELECT tests.as_service_role();
SELECT is(
  (SELECT first_name || '|' || (anonymized_at IS NOT NULL)::text
   FROM app.prospects WHERE id = '9805c001-0000-0000-0000-000000000001'),
  'Prospect|true',
  'Carla : prospect anonymisé, anonymized_at posé'
);

SELECT * FROM finish();
ROLLBACK;
```

> ⚠️ **Avant de figer ce test**, l'implémenteur DOIT lire le DDL réel de `app.dossiers` et compléter l'INSERT de fixture (colonnes NOT NULL, enums — ex. `dossiers` peut exiger `reference`, `formation_id`, `company_id`…) d'après la migration source. Garder les 8 assertions. La conservation de la preuve de signature (`signature_image_path` intact après scrub) est vérifiée par le **golden path manuel** (Task 6, step 3.5), pas en pgTAP (éviter le scaffolding lourd sessions/sheets).

- [ ] **Step 2: Commit**

```bash
git add supabase/tests/0086_test_rgpd_anonymization.sql
git commit -m "test(rgpd): pgTAP gardes + scrub + audit + idempotence anonymisation"
```

---

## Task 3: Helper pur `namesMatch` + schémas Zod + Vitest

**Files:**
- Create: `apps/web/app/(dashboard)/rgpd/rgpd-schema.ts`
- Create: `apps/web/app/(dashboard)/rgpd/name-match.ts`
- Create: `apps/web/app/(dashboard)/rgpd/name-match.test.ts`

- [ ] **Step 1: Écrire le test Vitest (rouge)**

Créer `apps/web/app/(dashboard)/rgpd/name-match.test.ts` :

```ts
import { describe, it, expect } from 'vitest';
import { namesMatch } from './name-match';
import { AnonymizeLearnerSchema, AnonymizeProspectSchema } from './rgpd-schema';

describe('namesMatch', () => {
  it('matche exact', () => expect(namesMatch('Durand', 'Durand')).toBe(true));
  it('ignore casse et espaces', () => {
    expect(namesMatch('  durand ', 'Durand')).toBe(true);
    expect(namesMatch('DURAND', 'durand')).toBe(true);
  });
  it('refuse une saisie différente', () => expect(namesMatch('Dupont', 'Durand')).toBe(false));
  it('refuse une saisie vide', () => expect(namesMatch('   ', 'Durand')).toBe(false));
});

describe('schemas', () => {
  it('AnonymizeLearnerSchema exige uuid + confirmName', () => {
    expect(AnonymizeLearnerSchema.safeParse({ learnerId: 'x', confirmName: 'A' }).success).toBe(false);
    expect(AnonymizeLearnerSchema.safeParse({
      learnerId: '1ea50002-0000-0000-0000-000000000002', confirmName: 'Durand',
    }).success).toBe(true);
  });
  it('AnonymizeProspectSchema exige uuid + confirmName', () => {
    expect(AnonymizeProspectSchema.safeParse({
      prospectId: '9805c001-0000-0000-0000-000000000001', confirmName: 'Petit',
    }).success).toBe(true);
  });
});
```

- [ ] **Step 2: Lancer le test (échec attendu)**

Run: `pnpm --filter web vitest run "app/(dashboard)/rgpd/name-match.test.ts"`
Expected: FAIL (modules introuvables).

- [ ] **Step 3: Écrire le helper pur**

Créer `apps/web/app/(dashboard)/rgpd/name-match.ts` :

```ts
/** Compare une saisie de confirmation au nom de famille réel (trim + insensible à la casse). */
export function namesMatch(input: string, actual: string): boolean {
  const norm = (s: string) => s.trim().toLocaleLowerCase();
  const a = norm(input);
  return a.length > 0 && a === norm(actual);
}
```

- [ ] **Step 4: Écrire les schémas Zod partagés**

Créer `apps/web/app/(dashboard)/rgpd/rgpd-schema.ts` :

```ts
import { z } from 'zod';

export const AnonymizeLearnerSchema = z.object({
  learnerId: z.string().uuid(),
  confirmName: z.string().min(1),
});
export type AnonymizeLearnerInput = z.infer<typeof AnonymizeLearnerSchema>;

export const AnonymizeProspectSchema = z.object({
  prospectId: z.string().uuid(),
  confirmName: z.string().min(1),
});
export type AnonymizeProspectInput = z.infer<typeof AnonymizeProspectSchema>;
```

- [ ] **Step 5: Lancer le test (vert)**

Run: `pnpm --filter web vitest run "app/(dashboard)/rgpd/name-match.test.ts"`
Expected: PASS (8 assertions).

- [ ] **Step 6: Commit**

```bash
git add "apps/web/app/(dashboard)/rgpd/name-match.ts" "apps/web/app/(dashboard)/rgpd/name-match.test.ts" "apps/web/app/(dashboard)/rgpd/rgpd-schema.ts"
git commit -m "feat(rgpd): schémas Zod + helper namesMatch (+ tests Vitest)"
```

---

## Task 4: Server Actions `anonymizeLearner` / `anonymizeProspect`

**Files:**
- Create: `apps/web/app/(dashboard)/rgpd/rgpd-actions.ts`

> Points clés :
> - La RPC est appelée via **`ctx.supabase`** (client authentifié, porte les claims JWT) — **jamais** via `supabaseAdmin()` (service_role = sans claims → la garde `is_admin_or_owner()` échouerait).
> - `supabaseAdmin()` sert **uniquement** à supprimer les blobs storage.
> - Résolveur d'org **restreint à owner/admin** (≠ `resolveAdminOrgId` existant qui inclut gestionnaire).

- [ ] **Step 1: Écrire le Server Action**

Créer `apps/web/app/(dashboard)/rgpd/rgpd-actions.ts` :

```ts
'use server';

import { revalidatePath } from 'next/cache';
import { authActionClient } from '@/shared/lib/safe-action';
import { supabaseAdmin } from '@/shared/lib/supabase/admin';
import { namesMatch } from './name-match';
import { AnonymizeLearnerSchema, AnonymizeProspectSchema } from './rgpd-schema';

const OWNER_ADMIN_ROLES = ['owner', 'admin'] as const;

type ErrCode =
  | 'forbidden_not_admin'
  | 'not_found'
  | 'active_dossier_exists'
  | 'name_mismatch';

type AnonymizeResult =
  | { ok: true; status: 'anonymized' | 'already_anonymized' }
  | { ok: false; error: ErrCode };

/** Org de l'utilisateur seulement s'il est owner/admin (sinon null). */
async function resolveOwnerAdminOrgId(userId: string): Promise<string | null> {
  const admin = supabaseAdmin();
  const { data: member } = await admin
    .schema('app')
    .from('members')
    .select('organization_id, role')
    .eq('user_id', userId)
    .is('deleted_at', null)
    .order('is_default_org', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!member?.organization_id) return null;
  if (!OWNER_ADMIN_ROLES.includes(member.role as (typeof OWNER_ADMIN_ROLES)[number])) return null;
  return member.organization_id;
}

/** Mappe le SQLSTATE custom des fonctions SQL vers un ErrCode applicatif. */
function mapRpcError(code: string | undefined): ErrCode {
  switch (code) {
    case 'P0401': return 'forbidden_not_admin';
    case 'P0409': return 'active_dossier_exists';
    default: return 'not_found'; // P0404 et tout autre échec
  }
}

/** Supprime des blobs storage en best-effort (n'altère jamais le succès DB déjà committé). */
async function removeBlobs(bucket: string, paths: string[]): Promise<void> {
  if (paths.length === 0) return;
  try {
    const { error } = await supabaseAdmin().storage.from(bucket).remove(paths);
    if (error) console.error(`[rgpd] storage.remove ${bucket} échec:`, error.message);
  } catch (e) {
    console.error(`[rgpd] storage.remove ${bucket} exception:`, e);
  }
}

export const anonymizeLearner = authActionClient
  .schema(AnonymizeLearnerSchema)
  .action(async ({ parsedInput, ctx }): Promise<AnonymizeResult> => {
    const orgId = await resolveOwnerAdminOrgId(ctx.userId as unknown as string);
    if (!orgId) return { ok: false, error: 'forbidden_not_admin' };

    // Vérifier la saisie de confirmation contre le nom réel (RLS-scopé à l'org).
    const { data: learner } = await ctx.supabase
      .schema('app')
      .from('learners')
      .select('last_name')
      .eq('id', parsedInput.learnerId)
      .is('deleted_at', null)
      .maybeSingle();
    if (!learner) return { ok: false, error: 'not_found' };
    if (!namesMatch(parsedInput.confirmName, learner.last_name)) {
      return { ok: false, error: 'name_mismatch' };
    }

    const { data, error } = await ctx.supabase
      .schema('app')
      .rpc('anonymize_learner', { p_learner_id: parsedInput.learnerId } as never);
    if (error) return { ok: false, error: mapRpcError(error.code) };

    const result = data as { status: 'anonymized' | 'already_anonymized'; storage_paths?: string[] };
    if (result.status === 'anonymized') {
      await removeBlobs('learner-submissions', result.storage_paths ?? []);
    }
    revalidatePath('/apprenants');
    return { ok: true, status: result.status };
  });

export const anonymizeProspect = authActionClient
  .schema(AnonymizeProspectSchema)
  .action(async ({ parsedInput, ctx }): Promise<AnonymizeResult> => {
    const orgId = await resolveOwnerAdminOrgId(ctx.userId as unknown as string);
    if (!orgId) return { ok: false, error: 'forbidden_not_admin' };

    const { data: prospect } = await ctx.supabase
      .schema('app')
      .from('prospects')
      .select('last_name')
      .eq('id', parsedInput.prospectId)
      .is('deleted_at', null)
      .maybeSingle();
    if (!prospect) return { ok: false, error: 'not_found' };
    if (!namesMatch(parsedInput.confirmName, prospect.last_name)) {
      return { ok: false, error: 'name_mismatch' };
    }

    const { data, error } = await ctx.supabase
      .schema('app')
      .rpc('anonymize_prospect', { p_prospect_id: parsedInput.prospectId } as never);
    if (error) return { ok: false, error: mapRpcError(error.code) };

    const result = data as { status: 'anonymized' | 'already_anonymized'; storage_paths?: string[] };
    if (result.status === 'anonymized') {
      await removeBlobs('prospect-documents', result.storage_paths ?? []);
    }
    revalidatePath('/prospects');
    return { ok: true, status: result.status };
  });
```

- [ ] **Step 2: Vérifier l'absence de nouvelle erreur TS**

Run: `pnpm --filter web typecheck 2>&1 | grep -i "app/(dashboard)/rgpd" || echo "OK: aucune nouvelle erreur dans rgpd/"`
Expected: `OK: aucune nouvelle erreur dans rgpd/` (les ~51 erreurs `@/env.mjs` pré-existantes sont hors périmètre).

- [ ] **Step 3: Commit**

```bash
git add "apps/web/app/(dashboard)/rgpd/rgpd-actions.ts"
git commit -m "feat(rgpd): server actions anonymizeLearner/anonymizeProspect (owner/admin, storage best-effort)"
```

---

## Task 5: Composant client de confirmation + branchement dans les listes

**Files:**
- Create: `apps/web/app/(dashboard)/rgpd/anonymize-action.tsx`
- Modify: `apps/web/app/(dashboard)/apprenants/page.tsx`
- Modify: `apps/web/app/(dashboard)/prospects/page.tsx`

> Pas de shadcn AlertDialog dans le repo → on copie le pattern état `confirm`/`pending` de `disable-mfa-button.tsx`, en ajoutant un champ de saisie du nom.

- [ ] **Step 1: Écrire le composant client**

Créer `apps/web/app/(dashboard)/rgpd/anonymize-action.tsx` :

```tsx
'use client';

import { useState, useTransition } from 'react';
import { ShieldX, Loader2 } from 'lucide-react';
import { Button } from '@/shared/ui/button';
import { anonymizeLearner, anonymizeProspect } from './rgpd-actions';
import { namesMatch } from './name-match';

type Subject =
  | { kind: 'learner'; id: string; lastName: string }
  | { kind: 'prospect'; id: string; lastName: string };

const ERR_MESSAGES: Record<string, string> = {
  forbidden_not_admin: 'Réservé aux administrateurs.',
  not_found: 'Introuvable.',
  active_dossier_exists: 'Clôturez ou annulez d’abord le(s) dossier(s) en cours.',
  name_mismatch: 'Le nom saisi ne correspond pas.',
};

export function AnonymizeAction({ subject }: { subject: Subject }) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const run = () => {
    setError(null);
    startTransition(async () => {
      const res =
        subject.kind === 'learner'
          ? await anonymizeLearner({ learnerId: subject.id, confirmName: typed })
          : await anonymizeProspect({ prospectId: subject.id, confirmName: typed });
      const data = res?.data;
      if (data?.ok) {
        window.location.reload();
      } else {
        setError(ERR_MESSAGES[data?.error ?? 'not_found'] ?? 'Échec de l’anonymisation.');
      }
    });
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="text-[12px] text-red-600 dark:text-red-400 hover:underline inline-flex items-center gap-1"
        title="Droit à l’effacement RGPD"
      >
        <ShieldX className="w-3 h-3" />
        Anonymiser (RGPD)
      </button>
    );
  }

  return (
    <div className="space-y-2 rounded-lg border border-red-200 dark:border-red-900/50 p-3 bg-red-50/50 dark:bg-red-950/20">
      <p className="text-[12px] text-red-700 dark:text-red-300">
        Action <strong>irréversible</strong>. Les identifiants directs seront effacés ; les preuves
        légales (émargements, conventions signées) sont conservées pseudonymisées.
        Saisissez le nom <strong>{subject.lastName}</strong> pour confirmer.
      </p>
      <input
        value={typed}
        onChange={(e) => setTyped(e.target.value)}
        placeholder="Nom de famille"
        className="w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2 py-1 text-[13px]"
      />
      <div className="flex items-center gap-2">
        <Button
          onClick={run}
          disabled={pending || !namesMatch(typed, subject.lastName)}
          variant="danger"
        >
          {pending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
          Anonymiser définitivement
        </Button>
        <Button onClick={() => setOpen(false)} variant="secondary" disabled={pending}>
          Annuler
        </Button>
      </div>
      {error && <p className="text-[12px] text-red-600">{error}</p>}
    </div>
  );
}
```

- [ ] **Step 2: Brancher dans la liste apprenants (admin-only)**

Lire `apps/web/app/(dashboard)/apprenants/page.tsx`. Identifier (a) comment l'org-rôle de l'utilisateur courant est déjà connu (sinon le charger en Server Component via `supabaseServer().auth.getUser()` + lecture `members.role`), et (b) la boucle qui rend chaque apprenant. Puis :

1. Ajouter en haut du fichier : `import { AnonymizeAction } from '../rgpd/anonymize-action';`
2. Déterminer `const isOwnerAdmin = ['owner','admin'].includes(role)` (role déjà résolu pour la page).
3. Dans le rendu de chaque ligne, ajouter (uniquement si `isOwnerAdmin` et apprenant non déjà anonymisé) :

```tsx
{isOwnerAdmin && !learner.anonymized_at && (
  <AnonymizeAction subject={{ kind: 'learner', id: learner.id, lastName: learner.last_name }} />
)}
```

> S'assurer que la requête de la page sélectionne bien `id, last_name, anonymized_at` pour chaque apprenant (ajouter ces colonnes au `.select(...)` si absentes).

- [ ] **Step 3: Brancher dans la liste prospects (admin-only) + avertissement « converti »**

Lire `apps/web/app/(dashboard)/prospects/page.tsx`. La page charge déjà les prospects via `supabaseAdmin()`. Ajouter :

1. `import { AnonymizeAction } from '../rgpd/anonymize-action';`
2. Résoudre `isOwnerAdmin` (rôle de l'utilisateur courant ; charger via `supabaseServer().auth.getUser()` + `members.role` si pas déjà disponible).
3. Pour chaque prospect (si `isOwnerAdmin` et `!prospect.anonymized_at`) :

```tsx
{isOwnerAdmin && !prospect.anonymized_at && (
  <div className="space-y-1">
    {prospect.converted_dossier_id && (
      <p className="text-[11px] text-amber-600 dark:text-amber-400">
        Converti en apprenant — anonymiser aussi la fiche apprenant si demandé.
      </p>
    )}
    <AnonymizeAction subject={{ kind: 'prospect', id: prospect.id, lastName: prospect.last_name }} />
  </div>
)}
```

> S'assurer que la requête sélectionne `id, last_name, anonymized_at, converted_dossier_id`.

- [ ] **Step 4: Vérifier le build TS (pas de nouvelle erreur)**

Run: `pnpm --filter web typecheck 2>&1 | grep -iE "app/\(dashboard\)/(rgpd|apprenants|prospects)" | grep -v env.mjs || echo "OK: pas de nouvelle erreur"`
Expected: `OK: pas de nouvelle erreur`

- [ ] **Step 5: Commit**

```bash
git add "apps/web/app/(dashboard)/rgpd/anonymize-action.tsx" "apps/web/app/(dashboard)/apprenants/page.tsx" "apps/web/app/(dashboard)/prospects/page.tsx"
git commit -m "feat(rgpd): action d'anonymisation (confirmation par nom) sur les listes apprenants/prospects"
```

---

## Task 6: Vérification finale + golden path manuel

**Files:** (aucun nouveau)

- [ ] **Step 1: Lancer toute la suite Vitest du périmètre**

Run: `pnpm --filter web vitest run "app/(dashboard)/rgpd"`
Expected: PASS.

- [ ] **Step 2: Re-vérifier la coordination + le numéro de migration AVANT push**

```bash
git fetch origin
git log origin/main --oneline -15            # repérer un éventuel 0086 concurrent
ls supabase/migrations/ | sort | tail -5      # dernier numéro réellement présent
```

Si `0086` est pris sur `origin/main` → renommer le fichier de migration **et** le fichier de test au prochain numéro libre, et ajuster les commits.

- [ ] **Step 3: Golden path manuel (à faire en CI/preview ou après déploiement migration)**

1. Connecté en owner/admin, ouvrir `/apprenants`, choisir un apprenant **sans dossier actif**.
2. Cliquer « Anonymiser (RGPD) », saisir le nom de famille, confirmer.
3. Vérifier : la ligne affiche « Apprenant anonymisé #… », `anonymized_at` posé.
4. Vérifier qu'un apprenant **avec dossier actif** renvoie « Clôturez ou annulez d’abord… ».
5. En base : `attendance_signatures.signer_ip` NULL **mais** `signature_image_path` conservé ; 1 ligne `audit.audit_log` (table_name='learners').
6. Idem `/prospects` (documents `prospect-documents` supprimés du bucket).

- [ ] **Step 4: Finaliser la branche**

REQUIRED SUB-SKILL: superpowers:finishing-a-development-branch (push + PR). Dans la PR : libérer le claim dans `docs/coordination/CLAIMS.md` (statut `mergé`) une fois la PR mergée.

---

## Notes de portabilité / pièges connus

- **`signer_country`** sur `attendance_signatures` : ajoutée par une migration ultérieure au schéma de base (`0040` la purge déjà). Vérifier sa présence ; si absente sur l'environnement cible, retirer la ligne `signer_country = NULL` du `UPDATE` (Task 1, 2b).
- **`dossiers.status = 'active'`** : valeur d'enum utilisée par `v_org_kpis` (spec dashboard) — confirmer l'enum `app.dossier_status` dans la migration source avant de figer la garde (Task 1) et les fixtures (Task 2).
- **Types générés** (`apps/web/shared/types/database.ts`) ne contiennent pas les nouvelles fonctions RPC → `as never` sur l'argument de `.rpc(...)` (déjà appliqué). Régénérer via `pnpm db:types` quand Docker/Supabase local est dispo (sinon write-only, OK en CI).
- **Numéro de migration** : `0086` est un placeholder de travail ; numéro réel = dernier `origin/main` + 1 au push.
- **Snapshots dénormalisés** (spec §4.1) : avant de figer la Task 1, `grep` les migrations pour un éventuel nom/email d'apprenant stocké en clair dans `dossiers.metadata`, `sessions.metadata` ou `documents.metadata` (ex. clés `learner_name`, `student`, `email`). Si présent, ajouter un `UPDATE … SET metadata = metadata - '<clé>'` ciblé dans `anonymize_learner`. À ce jour aucun snapshot de ce type n'est connu ; sinon la garde reste documentaire.
```
