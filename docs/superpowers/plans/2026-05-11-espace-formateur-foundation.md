# Espace Formateur — Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec source:** [docs/superpowers/specs/2026-05-11-espace-formateur-foundation-design.md](../specs/2026-05-11-espace-formateur-foundation-design.md)

**Goal:** Livrer la fondation de l'espace formateur i-a-infinity OF : multi-membership cross-OF (un `auth.users` ↔ N `app.trainers`), shell `app/(formateur)`, page profil et page CV/compétences.

**Architecture:** DDD light avec nouveau sous-context `features/identity/trainer-self/` (4 couches strictes). Migrations SQL + RLS policies + RPC `security definer` pour cross-OF read. Server Components par défaut, Server Actions via `next-safe-action` (pattern `authActionClient` à établir — premier usage du repo).

**Tech Stack:** Next.js 14 App Router (TS strict), Supabase (Postgres + RLS + Storage + Auth), Tailwind + shadcn/ui + RHF + Zod + TanStack Query, `next-safe-action` 7.9.3, Vitest 2.1.2, Playwright 1.47, pgTAP.

**Conventions du repo respectées :**
- Path alias `@/*` → `apps/web/*`
- Migrations en `supabase/migrations/NNNN_<name>.sql`
- Tests pgTAP en `supabase/tests/NNNN_test_*.sql`, helpers dans `_helpers.sql`
- Domain layer pur (zéro import next/supabase/react/zod)
- Branded UUIDs depuis `apps/web/features/dossier/domain/ids.ts`
- Commit + push `origin/main` après chaque tâche (Railway redeploy auto)

---

## Pré-requis bloquants (à régler avant Task 1)

- [ ] **Renommer `0026_seed_default_org.sql` en `0027_seed_default_org.sql`** (conflit de nom avec `0026_signature_electronique.sql` déjà mergé). Décale les numéros de ce plan : `0027` → `0028`, `0028` → `0029`, `0029` → `0030`. **Si renommage non fait, mettre à jour les paths de toutes les migrations ci-dessous (+1 sur chaque numéro)**.

```bash
git mv supabase/migrations/0026_seed_default_org.sql supabase/migrations/0027_seed_default_org.sql
git commit -m "fix(migrations): renomme seed_default_org en 0027 pour libérer 0026"
git push origin main
```

Le plan ci-dessous suppose ce renommage fait → numérotation `0028/0029/0030`.

---

## File Structure

### Nouvelles migrations
- `supabase/migrations/0028_trainer_multi_membership.sql` — index, unique, RPCs `list_my_trainer_memberships` + `link_my_trainer_rows`, triggers `trainers_autolink_user` + `trainers_self_edit_guard`
- `supabase/migrations/0029_trainer_rls_multi_membership.sql` — policies RLS self sur `app.trainers` et `app.trainer_competencies`
- `supabase/migrations/0030_buckets_trainer_self.sql` — buckets `avatars` et `trainer-cvs` + policies storage

### Nouveaux tests pgTAP
- `supabase/tests/0028_test_trainer_multi_membership.sql` — RPC, autolink, link, guard trigger
- `supabase/tests/0029_test_trainer_self_rls.sql` — policies RLS positive + négative

### Foundation partagée (premier usage repo)
- `apps/web/shared/lib/safe-action.ts` — instance `authActionClient` (next-safe-action + injection user/supabase)

### Branded ID
- Modif `apps/web/features/dossier/domain/ids.ts` : ajout `CompetencyId`

### Nouveau bounded context `trainer-self`

```
apps/web/features/identity/trainer-self/
├─ domain/
│  ├─ trainer-profile.ts             # entité TrainerProfile + invariants
│  ├─ trainer-profile.test.ts        # unit Vitest
│  ├─ trainer-competency.ts          # entité TrainerCompetency + invariants + status derive
│  ├─ trainer-competency.test.ts     # unit Vitest
│  └─ errors.ts                      # MembershipNotFound, ProfileFieldForbidden, CompetencyDateInvalid, UploadFailed
├─ application/
│  ├─ ports.ts                       # interfaces Repository/Reader/Storage
│  ├─ commands/
│  │  ├─ update-trainer-profile.ts
│  │  ├─ update-trainer-profile.integration.test.ts
│  │  ├─ add-competency.ts
│  │  ├─ add-competency.integration.test.ts
│  │  ├─ remove-competency.ts
│  │  └─ duplicate-competency-to-orgs.ts
│  └─ queries/
│     ├─ list-my-memberships.ts
│     ├─ get-my-profile.ts
│     ├─ list-my-competencies.ts
│     └─ get-competency-alerts.ts
├─ infrastructure/
│  ├─ supabase-trainer-self.repository.ts
│  ├─ supabase-trainer-competency.repository.ts
│  ├─ supabase-membership.reader.ts
│  ├─ supabase-avatar.storage.ts
│  └─ supabase-competency.storage.ts
└─ ui/
   ├─ schemas.ts                     # Zod partagés (TrainerProfileSchema, CompetencySchema)
   ├─ formateur-header.tsx           # Server Component
   ├─ of-switcher.tsx                # Client (popover shadcn)
   ├─ profile-form.tsx               # Client (RHF + Zod)
   ├─ competency-list.tsx            # Server Component
   ├─ competency-row.tsx             # Client (action menu)
   └─ competency-upload-dialog.tsx   # Client (RHF + file input)
```

### Routes
- Modif `apps/web/app/(formateur)/layout.tsx` — RPC link + header
- Nouvelle `apps/web/app/(formateur)/page.tsx` — dashboard
- Nouvelle `apps/web/app/(formateur)/profil/page.tsx` + `actions.ts`
- Nouvelle `apps/web/app/(formateur)/cv/page.tsx` + `actions.ts`
- Nouvelle `apps/web/app/(formateur)/api/set-focus/route.ts` — set cookie `of_focus`

### Wiring invitation OF
- Création `apps/web/app/(dashboard)/formateurs/nouveau/actions.ts` — Server Action INSERT `app.trainers` + `supabase.auth.admin.inviteUserByEmail`
- Modif `apps/web/app/(dashboard)/formateurs/nouveau/page.tsx` — câbler le form sur l'action (actuellement mock)

### E2E
- Nouvelle `apps/web/tests/e2e/trainer-self.spec.ts`

---

## Task 1: DB — Multi-membership migration + tests pgTAP

**Files:**
- Create: `supabase/migrations/0028_trainer_multi_membership.sql`
- Create: `supabase/tests/0028_test_trainer_multi_membership.sql`

- [ ] **Step 1: Écrire les tests pgTAP en premier (échouent)**

```sql
-- supabase/tests/0028_test_trainer_multi_membership.sql
BEGIN;
SELECT plan(12);

-- Fixtures
INSERT INTO auth.users (id, email)
VALUES
  ('11111111-1111-1111-1111-111111111111', 'formateur@example.com'),
  ('22222222-2222-2222-2222-222222222222', 'autre@example.com');

INSERT INTO app.organizations (id, name, slug)
VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'OF Alpha', 'of-alpha'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'OF Beta',  'of-beta');

-- 1) Trigger autolink : INSERT email='formateur@example.com', user_id NULL
INSERT INTO app.trainers (organization_id, first_name, last_name, email)
VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Alice', 'Martin', 'formateur@example.com'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Alice', 'Martin', 'formateur@example.com');

SELECT is(
  (SELECT count(*) FROM app.trainers WHERE email = 'formateur@example.com' AND user_id IS NULL)::int,
  0,
  'autolink trigger lie user_id pour les INSERT avec email matching auth.users'
);

SELECT is(
  (SELECT count(DISTINCT organization_id) FROM app.trainers WHERE user_id = '11111111-1111-1111-1111-111111111111')::int,
  2,
  'Un user a 2 lignes trainers cross-OF'
);

-- 2) Unique (user_id, organization_id) — double INSERT même OF
SELECT throws_ok(
  $$ INSERT INTO app.trainers (organization_id, first_name, last_name, email)
     VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Alice', 'Bis', 'formateur@example.com') $$,
  '23505',
  NULL,
  'Unique (user_id, organization_id) bloque le doublon dans le même OF'
);

-- 3) RPC list_my_trainer_memberships — auth.uid() = '11111111...'
SELECT tests.set_jwt(
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid,
  'authenticated',
  '11111111-1111-1111-1111-111111111111'::uuid
);
SELECT tests.as_authenticated();

SELECT is(
  (SELECT count(*) FROM app.list_my_trainer_memberships())::int,
  2,
  'RPC retourne les 2 memberships du user courant'
);

-- 4) RPC link_my_trainer_rows — idempotent
-- Insère une fiche en bypass trigger (simule cas où user_id NULL persiste)
SELECT tests.as_service_role();
INSERT INTO app.trainers (organization_id, first_name, last_name, email, user_id)
VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Test', 'Late', 'formateur@example.com', NULL);

SELECT tests.set_jwt(
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid,
  'authenticated',
  '11111111-1111-1111-1111-111111111111'::uuid
);
SELECT tests.as_authenticated();

SELECT is(
  (SELECT app.link_my_trainer_rows())::int,
  1,
  'link_my_trainer_rows link la fiche orpheline'
);
SELECT is(
  (SELECT app.link_my_trainer_rows())::int,
  0,
  'link_my_trainer_rows est idempotente (2e appel = 0 row affected)'
);

-- 5) Trigger self-edit guard — formateur tente changement is_internal
SELECT throws_ok(
  $$ UPDATE app.trainers SET is_internal = false
     WHERE user_id = '11111111-1111-1111-1111-111111111111'
       AND organization_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' $$,
  '42501',
  'forbidden field update by trainer self',
  'Guard trigger bloque UPDATE is_internal par le formateur lui-même'
);

SELECT throws_ok(
  $$ UPDATE app.trainers SET hourly_rate_cents = 9999
     WHERE user_id = '11111111-1111-1111-1111-111111111111'
       AND organization_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' $$,
  '42501',
  NULL,
  'Guard trigger bloque UPDATE hourly_rate_cents par le formateur lui-même'
);

SELECT throws_ok(
  $$ UPDATE app.trainers SET email = 'changed@example.com'
     WHERE user_id = '11111111-1111-1111-1111-111111111111'
       AND organization_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' $$,
  '42501',
  NULL,
  'Guard trigger bloque UPDATE email par le formateur lui-même'
);

-- 6) Service_role peut tout modifier
SELECT tests.as_service_role();
SELECT lives_ok(
  $$ UPDATE app.trainers SET hourly_rate_cents = 12000
     WHERE user_id = '11111111-1111-1111-1111-111111111111'
       AND organization_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' $$,
  'service_role peut UPDATE hourly_rate_cents'
);

-- 7) Formateur peut modifier bio
SELECT tests.set_jwt(
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid,
  'authenticated',
  '11111111-1111-1111-1111-111111111111'::uuid
);
SELECT tests.as_authenticated();
SELECT lives_ok(
  $$ UPDATE app.trainers SET bio = 'Ma bio'
     WHERE user_id = '11111111-1111-1111-1111-111111111111'
       AND organization_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' $$,
  'Formateur peut UPDATE bio (champ non protégé)'
);

-- 8) Empty user (no membership) — RPC retourne 0 rows
SELECT tests.set_jwt(
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid,
  'authenticated',
  '22222222-2222-2222-2222-222222222222'::uuid
);
SELECT tests.as_authenticated();
SELECT is(
  (SELECT count(*) FROM app.list_my_trainer_memberships())::int,
  0,
  'RPC retourne 0 pour un user sans membership'
);

SELECT * FROM finish();
ROLLBACK;
```

- [ ] **Step 2: Run les tests pour confirmer qu'ils échouent (objets non créés)**

Run: `pnpm db:reset && pnpm db:test`
Expected: échec → ERROR: function `app.list_my_trainer_memberships()` does not exist.

- [ ] **Step 3: Créer la migration `0028_trainer_multi_membership.sql`**

```sql
-- supabase/migrations/0028_trainer_multi_membership.sql
-- ============================================================================
-- 0028 — Trainer multi-membership : index, unique, RPCs, triggers
-- ============================================================================
-- Permet à un même auth.users.id d'avoir N lignes app.trainers (1 par OF).
-- Linkage automatique via trigger + RPC idempotente appelée au layout load.
-- Trigger garde-fou : le formateur lui-même ne peut pas changer ses champs
-- admin-only (email, is_internal, hourly_rate_cents, siret, organization_id).

-- 1) Index lookup cross-OF par user_id
CREATE INDEX ix_trainers_user_id
  ON app.trainers(user_id)
  WHERE user_id IS NOT NULL AND deleted_at IS NULL;

-- 2) Unique (user_id, organization_id) : 1 fiche max par user par OF
CREATE UNIQUE INDEX ux_trainers_user_org
  ON app.trainers(user_id, organization_id)
  WHERE user_id IS NOT NULL AND deleted_at IS NULL;

-- 3) RPC : liste les memberships du user courant
CREATE OR REPLACE FUNCTION app.list_my_trainer_memberships()
RETURNS TABLE (
  organization_id UUID,
  organization_name TEXT,
  trainer_id UUID,
  first_name TEXT,
  last_name TEXT,
  is_internal BOOLEAN
)
LANGUAGE sql SECURITY DEFINER SET search_path = app, public STABLE AS $$
  SELECT o.id, o.name, t.id, t.first_name, t.last_name, t.is_internal
  FROM app.trainers t
  JOIN app.organizations o ON o.id = t.organization_id
  WHERE t.user_id = auth.uid()
    AND t.deleted_at IS NULL
  ORDER BY o.name;
$$;
GRANT EXECUTE ON FUNCTION app.list_my_trainer_memberships() TO authenticated;

-- 4) Trigger autolink à l'INSERT/UPDATE d'app.trainers
CREATE OR REPLACE FUNCTION app.trainers_autolink_user()
RETURNS TRIGGER LANGUAGE plpgsql
SECURITY DEFINER SET search_path = app, public AS $$
BEGIN
  IF NEW.user_id IS NULL AND NEW.email IS NOT NULL THEN
    SELECT id INTO NEW.user_id FROM auth.users WHERE email = NEW.email LIMIT 1;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER tr_trainers_autolink
  BEFORE INSERT OR UPDATE OF email ON app.trainers
  FOR EACH ROW EXECUTE FUNCTION app.trainers_autolink_user();

-- 5) RPC idempotente : link les fiches orphelines pour le user courant
CREATE OR REPLACE FUNCTION app.link_my_trainer_rows()
RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = app, public AS $$
DECLARE
  v_email CITEXT;
  v_count INTEGER;
BEGIN
  SELECT email INTO v_email FROM auth.users WHERE id = auth.uid();
  IF v_email IS NULL THEN RETURN 0; END IF;

  UPDATE app.trainers
  SET user_id = auth.uid(), updated_at = now()
  WHERE email = v_email AND user_id IS NULL AND deleted_at IS NULL;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END $$;
GRANT EXECUTE ON FUNCTION app.link_my_trainer_rows() TO authenticated;

-- 6) Trigger garde-fou self-edit
CREATE OR REPLACE FUNCTION app.trainers_self_edit_guard()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  -- Si l'updater est le trainer lui-même (user_id du row = auth.uid()),
  -- aucun champ admin-only ne doit changer.
  IF NEW.user_id = auth.uid() AND OLD.user_id = auth.uid() THEN
    IF NEW.email             IS DISTINCT FROM OLD.email             OR
       NEW.is_internal       IS DISTINCT FROM OLD.is_internal       OR
       NEW.hourly_rate_cents IS DISTINCT FROM OLD.hourly_rate_cents OR
       NEW.siret             IS DISTINCT FROM OLD.siret             OR
       NEW.organization_id   IS DISTINCT FROM OLD.organization_id
    THEN
      RAISE EXCEPTION 'forbidden field update by trainer self'
        USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER tr_trainers_self_edit_guard
  BEFORE UPDATE ON app.trainers
  FOR EACH ROW EXECUTE FUNCTION app.trainers_self_edit_guard();
```

- [ ] **Step 4: Run les tests pour vérifier qu'ils passent**

Run: `pnpm db:reset && pnpm db:test`
Expected: PASS 12/12 sur `0028_test_trainer_multi_membership.sql`.

- [ ] **Step 5: Commit + push**

```bash
git add supabase/migrations/0028_trainer_multi_membership.sql supabase/tests/0028_test_trainer_multi_membership.sql
git commit -m "$(cat <<'EOF'
feat(db): multi-membership formateur (un auth.users ↔ N trainers)

Index + unique (user_id, organization_id) + 2 RPC security definer
(list_my_trainer_memberships, link_my_trainer_rows) + 2 triggers
(autolink, self-edit guard). Tests pgTAP 12/12.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)" -- supabase/migrations/0028_trainer_multi_membership.sql supabase/tests/0028_test_trainer_multi_membership.sql
git push origin main
```

---

## Task 2: DB — RLS policies self + tests pgTAP

**Files:**
- Create: `supabase/migrations/0029_trainer_rls_multi_membership.sql`
- Create: `supabase/tests/0029_test_trainer_self_rls.sql`

- [ ] **Step 1: Écrire les tests pgTAP RLS (échouent)**

```sql
-- supabase/tests/0029_test_trainer_self_rls.sql
BEGIN;
SELECT plan(10);

-- Fixtures partagées avec 0028
INSERT INTO auth.users (id, email) VALUES
  ('11111111-1111-1111-1111-111111111111', 'formateur@example.com'),
  ('22222222-2222-2222-2222-222222222222', 'autre@example.com');
INSERT INTO app.organizations (id, name, slug) VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'OF Alpha', 'of-alpha');
INSERT INTO app.trainers (id, organization_id, first_name, last_name, email)
VALUES
  ('cccccccc-cccc-cccc-cccc-cccccccccccc',
   'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Alice', 'Martin', 'formateur@example.com'),
  ('dddddddd-dddd-dddd-dddd-dddddddddddd',
   'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Bob', 'Dupont', 'autre@example.com');

INSERT INTO app.trainer_competencies (organization_id, trainer_id, kind, title)
VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
   'cccccccc-cccc-cccc-cccc-cccccccccccc', 'diploma', 'Master MEEF'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
   'dddddddd-dddd-dddd-dddd-dddddddddddd', 'diploma', 'Bac+2 RH');

-- Formateur Alice
SELECT tests.set_jwt(
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid,
  'authenticated',
  '11111111-1111-1111-1111-111111111111'::uuid
);
SELECT tests.as_authenticated();

-- SELECT self trainers
SELECT is(
  (SELECT count(*) FROM app.trainers WHERE id = 'cccccccc-cccc-cccc-cccc-cccccccccccc')::int,
  1,
  'Alice voit sa propre fiche trainer'
);
SELECT is(
  (SELECT count(*) FROM app.trainers WHERE id = 'dddddddd-dddd-dddd-dddd-dddddddddddd')::int,
  0,
  'Alice ne voit pas la fiche de Bob (même OF) — policy self uniquement'
);

-- SELECT self competencies
SELECT is(
  (SELECT count(*) FROM app.trainer_competencies
   WHERE trainer_id = 'cccccccc-cccc-cccc-cccc-cccccccccccc')::int,
  1,
  'Alice voit ses propres compétences'
);
SELECT is(
  (SELECT count(*) FROM app.trainer_competencies
   WHERE trainer_id = 'dddddddd-dddd-dddd-dddd-dddddddddddd')::int,
  0,
  'Alice ne voit pas les compétences de Bob'
);

-- INSERT self competency
SELECT lives_ok(
  $$ INSERT INTO app.trainer_competencies (organization_id, trainer_id, kind, title)
     VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
             'cccccccc-cccc-cccc-cccc-cccccccccccc', 'certification', 'TOEIC 950') $$,
  'Alice peut INSERT une compétence sur sa fiche'
);

-- INSERT competency d'un autre trainer (Bob) — refusé par WITH CHECK
SELECT throws_ok(
  $$ INSERT INTO app.trainer_competencies (organization_id, trainer_id, kind, title)
     VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
             'dddddddd-dddd-dddd-dddd-dddddddddddd', 'certification', 'Spoof') $$,
  '42501',
  NULL,
  'Alice ne peut pas INSERT une compétence sur la fiche de Bob (RLS WITH CHECK)'
);

-- UPDATE bio self : OK
SELECT lives_ok(
  $$ UPDATE app.trainers SET bio = 'Hello' WHERE id = 'cccccccc-cccc-cccc-cccc-cccccccccccc' $$,
  'Alice peut UPDATE sa bio'
);

-- UPDATE bio d'un autre : 0 rows (policy USING)
SELECT is(
  (SELECT count(*) FROM (
    UPDATE app.trainers SET bio = 'Spoof' WHERE id = 'dddddddd-dddd-dddd-dddd-dddddddddddd' RETURNING 1
  ) s)::int,
  0,
  'Alice update sur fiche de Bob = 0 rows (RLS USING filtre)'
);

-- DELETE self competency
SELECT is(
  (SELECT count(*) FROM (
    DELETE FROM app.trainer_competencies WHERE trainer_id = 'cccccccc-cccc-cccc-cccc-cccccccccccc' RETURNING 1
  ) s)::int,
  2,
  'Alice peut DELETE ses propres compétences (master + certif TOEIC)'
);

-- User sans membership — 0 rows visibles
SELECT tests.set_jwt(
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid,
  'authenticated',
  '22222222-2222-2222-2222-222222222222'::uuid
);
SELECT tests.as_authenticated();
SELECT is(
  (SELECT count(*) FROM app.trainers)::int,
  0,
  'User sans membership voit 0 trainers via policy self (admin policies non déclenchées sans member_id)'
);

SELECT * FROM finish();
ROLLBACK;
```

> ⚠️ **Note** : le dernier test suppose qu'aucune autre policy admin ne match pour ce user. Si l'utilisateur a un `member_id` admin sur l'OF, les policies admin existantes s'appliqueront (OR). Le test ci-dessus utilise un user sans `member_id` (paramètre par défaut de `set_jwt`). Si le test échoue, ajuster `set_jwt(..., NULL)` explicite et vérifier les policies admin existantes (0019).

- [ ] **Step 2: Run les tests, voir échec**

Run: `pnpm db:reset && pnpm db:test`
Expected: échec → "permission denied" sur SELECT/INSERT (policies self pas encore créées).

- [ ] **Step 3: Créer `0029_trainer_rls_multi_membership.sql`**

```sql
-- supabase/migrations/0029_trainer_rls_multi_membership.sql
-- ============================================================================
-- 0029 — RLS self-access pour formateur multi-OF
-- ============================================================================
-- Policies ADDITIVES (OR avec policies admin existantes de 0019).
-- Le trainer authentifié peut SELECT/UPDATE sa propre fiche (cross-OF) et
-- CRUD ses compétences. Les champs admin-only sont protégés par le trigger
-- trainers_self_edit_guard (cf. 0028).

-- ── app.trainers ────────────────────────────────────────────────────────────

CREATE POLICY trainers_self_select ON app.trainers
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() AND deleted_at IS NULL);

CREATE POLICY trainers_self_update ON app.trainers
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid() AND deleted_at IS NULL)
  WITH CHECK (user_id = auth.uid());

-- ── app.trainer_competencies ────────────────────────────────────────────────

CREATE POLICY trainer_comps_self_select ON app.trainer_competencies
  FOR SELECT TO authenticated
  USING (trainer_id IN (
    SELECT id FROM app.trainers
    WHERE user_id = auth.uid() AND deleted_at IS NULL
  ));

CREATE POLICY trainer_comps_self_insert ON app.trainer_competencies
  FOR INSERT TO authenticated
  WITH CHECK (trainer_id IN (
    SELECT id FROM app.trainers
    WHERE user_id = auth.uid() AND deleted_at IS NULL
  ));

CREATE POLICY trainer_comps_self_update ON app.trainer_competencies
  FOR UPDATE TO authenticated
  USING (trainer_id IN (
    SELECT id FROM app.trainers
    WHERE user_id = auth.uid() AND deleted_at IS NULL
  ))
  WITH CHECK (trainer_id IN (
    SELECT id FROM app.trainers
    WHERE user_id = auth.uid() AND deleted_at IS NULL
  ));

CREATE POLICY trainer_comps_self_delete ON app.trainer_competencies
  FOR DELETE TO authenticated
  USING (trainer_id IN (
    SELECT id FROM app.trainers
    WHERE user_id = auth.uid() AND deleted_at IS NULL
  ));
```

- [ ] **Step 4: Run tests, vérifier PASS**

Run: `pnpm db:test`
Expected: PASS 10/10 sur `0029_test_trainer_self_rls.sql`.

- [ ] **Step 5: Commit + push**

```bash
git add supabase/migrations/0029_trainer_rls_multi_membership.sql supabase/tests/0029_test_trainer_self_rls.sql
git commit -m "feat(db): RLS self-access formateur multi-OF (SELECT/UPDATE trainers + CRUD competencies)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>" -- supabase/migrations/0029_trainer_rls_multi_membership.sql supabase/tests/0029_test_trainer_self_rls.sql
git push origin main
```

---

## Task 3: DB — Buckets Storage + policies

**Files:**
- Create: `supabase/migrations/0030_buckets_trainer_self.sql`

> Pas de pgTAP pour les buckets (policies Storage testées E2E via Playwright en Task 13).

- [ ] **Step 1: Créer la migration buckets**

```sql
-- supabase/migrations/0030_buckets_trainer_self.sql
-- ============================================================================
-- 0030 — Buckets Storage pour l'espace formateur self
-- ============================================================================

-- ── Bucket avatars (public-read, owner-write) ───────────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'avatars',
  'avatars',
  true, -- public-read
  5 * 1024 * 1024, -- 5 MB
  ARRAY['image/png', 'image/jpeg', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- Path = ${user_id}/avatar.{ext} — write par owner uniquement
CREATE POLICY "avatars_owner_write"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "avatars_owner_update"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "avatars_owner_delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
-- READ public via bucket.public = true (pas de policy SELECT nécessaire)

-- ── Bucket trainer-cvs (privé) ──────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'trainer-cvs',
  'trainer-cvs',
  false,
  10 * 1024 * 1024, -- 10 MB
  ARRAY['application/pdf', 'image/png', 'image/jpeg']
)
ON CONFLICT (id) DO NOTHING;

-- Path = ${organization_id}/${trainer_id}/${competency_id}.{ext}
-- Read : self (path[2] = trainer_id ∈ mes trainers) OU admin OF (via policies existantes si elles couvrent storage)
CREATE POLICY "trainer_cvs_self_read"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'trainer-cvs'
    AND (storage.foldername(name))[2]::uuid IN (
      SELECT id FROM app.trainers WHERE user_id = auth.uid() AND deleted_at IS NULL
    )
  );

CREATE POLICY "trainer_cvs_self_write"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'trainer-cvs'
    AND (storage.foldername(name))[2]::uuid IN (
      SELECT id FROM app.trainers WHERE user_id = auth.uid() AND deleted_at IS NULL
    )
  );

CREATE POLICY "trainer_cvs_self_delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'trainer-cvs'
    AND (storage.foldername(name))[2]::uuid IN (
      SELECT id FROM app.trainers WHERE user_id = auth.uid() AND deleted_at IS NULL
    )
  );
-- (Lecture admin OF via service_role uniquement en V1 — policy admin storage TBD en sous-projet 3 si besoin)
```

- [ ] **Step 2: Run `pnpm db:reset` pour vérifier que la migration s'applique sans erreur**

Run: `pnpm db:reset`
Expected: aucune erreur, buckets `avatars` et `trainer-cvs` créés.

- [ ] **Step 3: Vérifier création des buckets**

Run: `psql "$DATABASE_URL" -c "SELECT id, name, public FROM storage.buckets WHERE id IN ('avatars', 'trainer-cvs');"`
Expected: 2 rows retournés.

- [ ] **Step 4: Régénérer les types TS**

Run: `pnpm db:types`
Expected: `apps/web/shared/types/database.ts` mis à jour avec les nouvelles RPC.

- [ ] **Step 5: Commit + push**

```bash
git add supabase/migrations/0030_buckets_trainer_self.sql apps/web/shared/types/database.ts
git commit -m "feat(db): buckets avatars (public) + trainer-cvs (privé, RLS self)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>" -- supabase/migrations/0030_buckets_trainer_self.sql apps/web/shared/types/database.ts
git push origin main
```

---

## Task 4: Foundation — `authActionClient` + Branded ID

**Files:**
- Create: `apps/web/shared/lib/safe-action.ts`
- Modify: `apps/web/features/dossier/domain/ids.ts`

> Foundation établit le pattern `authActionClient` (mentionné CLAUDE.md mais pas encore implémenté). Toutes les Server Actions formateur s'appuieront dessus.

- [ ] **Step 1: Ajouter `CompetencyId` aux branded IDs**

Edit `apps/web/features/dossier/domain/ids.ts` — ajouter après la ligne `TrainerId` :

```ts
export type CompetencyId = Brand<string, 'CompetencyId'>;
export const CompetencyId = makeId<'CompetencyId'>();
```

- [ ] **Step 2: Créer `safe-action.ts`**

```ts
// apps/web/shared/lib/safe-action.ts
import 'server-only';
import { createSafeActionClient, DEFAULT_SERVER_ERROR_MESSAGE } from 'next-safe-action';
import { supabaseServer } from '@/shared/lib/supabase/server';
import type { Database } from '@/shared/types/database';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { UserId } from '@/features/dossier/domain/ids';
import { UserId as makeUserId } from '@/features/dossier/domain/ids';

export class UnauthenticatedError extends Error {
  readonly tag = 'UnauthenticatedError';
  constructor() {
    super('Unauthenticated');
  }
}

export type AuthCtx = {
  userId: UserId;
  email: string;
  supabase: SupabaseClient<Database>;
};

export const actionClient = createSafeActionClient({
  handleServerError(e) {
    if (e instanceof UnauthenticatedError) return 'unauthenticated';
    console.error('[safe-action]', e);
    return DEFAULT_SERVER_ERROR_MESSAGE;
  },
});

export const authActionClient = actionClient.use(async ({ next }) => {
  const supabase = supabaseServer();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new UnauthenticatedError();
  const ctx: AuthCtx = {
    userId: makeUserId(data.user.id),
    email: data.user.email ?? '',
    supabase,
  };
  return next({ ctx });
});
```

- [ ] **Step 3: Vérifier que ça typecheck**

Run: `pnpm typecheck`
Expected: 0 erreur.

- [ ] **Step 4: Commit + push**

```bash
git add apps/web/shared/lib/safe-action.ts apps/web/features/dossier/domain/ids.ts
git commit -m "feat(safe-action): authActionClient (premier usage repo) + CompetencyId

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>" -- apps/web/shared/lib/safe-action.ts apps/web/features/dossier/domain/ids.ts
git push origin main
```

---

## Task 5: Domain — `TrainerProfile` entity (TDD)

**Files:**
- Create: `apps/web/features/identity/trainer-self/domain/errors.ts`
- Create: `apps/web/features/identity/trainer-self/domain/trainer-profile.ts`
- Test: `apps/web/features/identity/trainer-self/domain/trainer-profile.test.ts`

- [ ] **Step 1: Écrire le test domain (échec)**

```ts
// apps/web/features/identity/trainer-self/domain/trainer-profile.test.ts
import { describe, it, expect } from 'vitest';
import { TrainerProfile } from './trainer-profile';
import { TrainerId, OrganizationId, UserId } from '@/features/dossier/domain/ids';

const baseProps = {
  id: TrainerId('00000000-0000-0000-0000-000000000001'),
  organizationId: OrganizationId('00000000-0000-0000-0000-0000000000aa'),
  userId: UserId('00000000-0000-0000-0000-000000000099'),
  firstName: 'Alice',
  lastName: 'Martin',
  email: 'alice@example.com',
  phone: null,
  bio: null,
  specialties: [] as string[],
  avatarPath: null,
  isInternal: true,
};

describe('TrainerProfile', () => {
  it('crée un profil avec des invariants OK', () => {
    const p = TrainerProfile.hydrate(baseProps);
    expect(p.firstName).toBe('Alice');
    expect(p.specialties).toEqual([]);
  });

  it('applyPatch met à jour bio/phone/specialties', () => {
    const p = TrainerProfile.hydrate(baseProps);
    p.applyPatch({ bio: 'Hello', phone: '+33612345678', specialties: ['fr', 'qualiopi'] });
    expect(p.bio).toBe('Hello');
    expect(p.phone).toBe('+33612345678');
    expect(p.specialties).toEqual(['fr', 'qualiopi']);
  });

  it('rejette bio > 2000 chars', () => {
    const p = TrainerProfile.hydrate(baseProps);
    expect(() => p.applyPatch({ bio: 'x'.repeat(2001) })).toThrow('bio too long');
  });

  it('rejette specialties > 12 items', () => {
    const p = TrainerProfile.hydrate(baseProps);
    expect(() => p.applyPatch({ specialties: Array(13).fill('s') })).toThrow('too many specialties');
  });

  it('toPersistence retourne les champs persistables uniquement (sans email/is_internal)', () => {
    const p = TrainerProfile.hydrate(baseProps);
    p.applyPatch({ bio: 'Hi' });
    const dto = p.toPersistence();
    expect(dto).toHaveProperty('bio', 'Hi');
    expect(dto).not.toHaveProperty('email');
    expect(dto).not.toHaveProperty('is_internal');
  });
});
```

- [ ] **Step 2: Run, voir échec**

Run: `pnpm --filter web test trainer-profile`
Expected: échec — `TrainerProfile` introuvable.

- [ ] **Step 3: Créer `errors.ts`**

```ts
// apps/web/features/identity/trainer-self/domain/errors.ts
export class MembershipNotFound extends Error {
  readonly tag = 'MembershipNotFound';
  constructor(public readonly trainerId: string) { super(`Membership not found: ${trainerId}`); }
}

export class ProfileFieldForbidden extends Error {
  readonly tag = 'ProfileFieldForbidden';
  constructor(public readonly field: string) { super(`Forbidden update on field: ${field}`); }
}

export class CompetencyDateInvalid extends Error {
  readonly tag = 'CompetencyDateInvalid';
  constructor() { super('expires_at must be after obtained_at'); }
}

export class CompetencyNotFound extends Error {
  readonly tag = 'CompetencyNotFound';
  constructor(public readonly id: string) { super(`Competency not found: ${id}`); }
}

export class UploadFailed extends Error {
  readonly tag = 'UploadFailed';
  constructor(public readonly reason: string) { super(`Upload failed: ${reason}`); }
}
```

- [ ] **Step 4: Créer `trainer-profile.ts`**

```ts
// apps/web/features/identity/trainer-self/domain/trainer-profile.ts
import type { TrainerId, OrganizationId, UserId } from '@/features/dossier/domain/ids';

export type TrainerProfileProps = {
  id: TrainerId;
  organizationId: OrganizationId;
  userId: UserId;
  firstName: string;
  lastName: string;
  email: string;        // readonly côté domain
  phone: string | null;
  bio: string | null;
  specialties: string[];
  avatarPath: string | null;
  isInternal: boolean;  // readonly côté domain
};

export type TrainerProfilePatch = {
  firstName?: string;
  lastName?: string;
  phone?: string | null;
  bio?: string | null;
  specialties?: string[];
  avatarPath?: string | null;
};

export class TrainerProfile {
  private constructor(private props: TrainerProfileProps) {}

  static hydrate(props: TrainerProfileProps): TrainerProfile {
    return new TrainerProfile({ ...props });
  }

  get id() { return this.props.id; }
  get organizationId() { return this.props.organizationId; }
  get firstName() { return this.props.firstName; }
  get lastName() { return this.props.lastName; }
  get email() { return this.props.email; }       // read-only côté domain
  get phone() { return this.props.phone; }
  get bio() { return this.props.bio; }
  get specialties() { return [...this.props.specialties]; }
  get avatarPath() { return this.props.avatarPath; }
  get isInternal() { return this.props.isInternal; }

  applyPatch(patch: TrainerProfilePatch): void {
    if (patch.firstName !== undefined) {
      if (patch.firstName.trim().length === 0) throw new Error('firstName empty');
      if (patch.firstName.length > 100) throw new Error('firstName too long');
      this.props.firstName = patch.firstName.trim();
    }
    if (patch.lastName !== undefined) {
      if (patch.lastName.trim().length === 0) throw new Error('lastName empty');
      if (patch.lastName.length > 100) throw new Error('lastName too long');
      this.props.lastName = patch.lastName.trim();
    }
    if (patch.phone !== undefined) {
      if (patch.phone !== null && patch.phone.length > 30) throw new Error('phone too long');
      this.props.phone = patch.phone;
    }
    if (patch.bio !== undefined) {
      if (patch.bio !== null && patch.bio.length > 2000) throw new Error('bio too long');
      this.props.bio = patch.bio;
    }
    if (patch.specialties !== undefined) {
      if (patch.specialties.length > 12) throw new Error('too many specialties');
      this.props.specialties = patch.specialties.map(s => s.trim()).filter(Boolean);
    }
    if (patch.avatarPath !== undefined) {
      this.props.avatarPath = patch.avatarPath;
    }
  }

  toPersistence(): {
    id: TrainerId;
    first_name: string;
    last_name: string;
    phone: string | null;
    bio: string | null;
    specialties: string[];
    metadata: Record<string, unknown>;
  } {
    return {
      id: this.props.id,
      first_name: this.props.firstName,
      last_name: this.props.lastName,
      phone: this.props.phone,
      bio: this.props.bio,
      specialties: this.props.specialties,
      metadata: this.props.avatarPath ? { avatar_path: this.props.avatarPath } : {},
    };
  }
}
```

> **Note** : `avatarPath` est stocké dans `metadata.avatar_path` (JSONB existant sur `app.trainers`). Pas de migration de schéma supplémentaire requise.

- [ ] **Step 5: Run le test, PASS**

Run: `pnpm --filter web test trainer-profile`
Expected: PASS 5/5.

- [ ] **Step 6: Commit + push**

```bash
git add apps/web/features/identity/trainer-self/domain/errors.ts apps/web/features/identity/trainer-self/domain/trainer-profile.ts apps/web/features/identity/trainer-self/domain/trainer-profile.test.ts
git commit -m "feat(trainer-self/domain): TrainerProfile entity + erreurs domain

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>" -- apps/web/features/identity/trainer-self/domain/
git push origin main
```

---

## Task 6: Domain — `TrainerCompetency` entity (TDD)

**Files:**
- Create: `apps/web/features/identity/trainer-self/domain/trainer-competency.ts`
- Test: `apps/web/features/identity/trainer-self/domain/trainer-competency.test.ts`

- [ ] **Step 1: Écrire le test (échec)**

```ts
// apps/web/features/identity/trainer-self/domain/trainer-competency.test.ts
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { TrainerCompetency } from './trainer-competency';
import { CompetencyDateInvalid } from './errors';
import { CompetencyId, TrainerId } from '@/features/dossier/domain/ids';

const NOW = new Date('2026-05-11T10:00:00Z');

describe('TrainerCompetency', () => {
  beforeAll(() => { vi.useFakeTimers(); vi.setSystemTime(NOW); });
  afterAll(() => { vi.useRealTimers(); });

  const base = {
    id: CompetencyId('00000000-0000-0000-0000-000000000001'),
    trainerId: TrainerId('00000000-0000-0000-0000-00000000000a'),
    kind: 'diploma' as const,
    title: 'Master MEEF',
    issuer: 'Université Paris-Saclay',
    obtainedAt: new Date('2020-06-15'),
    expiresAt: null as Date | null,
    documentPath: null as string | null,
  };

  it('crée une compétence valide sans expiration', () => {
    const c = TrainerCompetency.create(base);
    expect(c.status).toBe('no_expiry');
  });

  it("status = 'valid' si expiresAt > now + 90j", () => {
    const c = TrainerCompetency.create({
      ...base, expiresAt: new Date('2027-01-01')
    });
    expect(c.status).toBe('valid');
  });

  it("status = 'expiring_soon' si expiresAt dans <90j", () => {
    const c = TrainerCompetency.create({
      ...base, expiresAt: new Date('2026-06-15') // ~35 jours
    });
    expect(c.status).toBe('expiring_soon');
  });

  it("status = 'expired' si expiresAt < now", () => {
    const c = TrainerCompetency.create({
      ...base, expiresAt: new Date('2025-01-01')
    });
    expect(c.status).toBe('expired');
  });

  it('refuse expiresAt <= obtainedAt', () => {
    expect(() => TrainerCompetency.create({
      ...base,
      obtainedAt: new Date('2026-01-01'),
      expiresAt: new Date('2025-12-31'),
    })).toThrow(CompetencyDateInvalid);
  });
});
```

- [ ] **Step 2: Run, voir échec**

Run: `pnpm --filter web test trainer-competency`
Expected: échec — `TrainerCompetency` introuvable.

- [ ] **Step 3: Créer `trainer-competency.ts`**

```ts
// apps/web/features/identity/trainer-self/domain/trainer-competency.ts
import { CompetencyDateInvalid } from './errors';
import type { CompetencyId, TrainerId } from '@/features/dossier/domain/ids';

export type CompetencyKind = 'diploma' | 'certification' | 'experience' | 'cv';
export type CompetencyStatus = 'valid' | 'expiring_soon' | 'expired' | 'no_expiry';

const EXPIRING_SOON_DAYS = 90;

export type TrainerCompetencyProps = {
  id: CompetencyId;
  trainerId: TrainerId;
  kind: CompetencyKind;
  title: string;
  issuer: string | null;
  obtainedAt: Date | null;
  expiresAt: Date | null;
  documentPath: string | null;
};

export class TrainerCompetency {
  private constructor(private props: TrainerCompetencyProps) {}

  static create(props: TrainerCompetencyProps): TrainerCompetency {
    if (props.obtainedAt && props.expiresAt && props.expiresAt <= props.obtainedAt) {
      throw new CompetencyDateInvalid();
    }
    return new TrainerCompetency({ ...props });
  }

  static hydrate(props: TrainerCompetencyProps): TrainerCompetency {
    return new TrainerCompetency({ ...props });
  }

  get id() { return this.props.id; }
  get trainerId() { return this.props.trainerId; }
  get kind() { return this.props.kind; }
  get title() { return this.props.title; }
  get issuer() { return this.props.issuer; }
  get obtainedAt() { return this.props.obtainedAt; }
  get expiresAt() { return this.props.expiresAt; }
  get documentPath() { return this.props.documentPath; }

  get status(): CompetencyStatus {
    if (!this.props.expiresAt) return 'no_expiry';
    const now = new Date();
    if (this.props.expiresAt <= now) return 'expired';
    const daysLeft = (this.props.expiresAt.getTime() - now.getTime()) / 86_400_000;
    return daysLeft <= EXPIRING_SOON_DAYS ? 'expiring_soon' : 'valid';
  }

  toPersistence() {
    return {
      id: this.props.id,
      trainer_id: this.props.trainerId,
      kind: this.props.kind,
      title: this.props.title,
      issuer: this.props.issuer,
      obtained_at: this.props.obtainedAt?.toISOString().slice(0, 10) ?? null,
      expires_at: this.props.expiresAt?.toISOString().slice(0, 10) ?? null,
      document_path: this.props.documentPath,
    };
  }
}
```

- [ ] **Step 4: Run, PASS**

Run: `pnpm --filter web test trainer-competency`
Expected: PASS 5/5.

- [ ] **Step 5: Commit + push**

```bash
git add apps/web/features/identity/trainer-self/domain/trainer-competency.ts apps/web/features/identity/trainer-self/domain/trainer-competency.test.ts
git commit -m "feat(trainer-self/domain): TrainerCompetency entity + status derive (90j seuil)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>" -- apps/web/features/identity/trainer-self/domain/trainer-competency.ts apps/web/features/identity/trainer-self/domain/trainer-competency.test.ts
git push origin main
```

---

## Task 7: Application — Ports + Queries

**Files:**
- Create: `apps/web/features/identity/trainer-self/application/ports.ts`
- Create: `apps/web/features/identity/trainer-self/application/queries/list-my-memberships.ts`
- Create: `apps/web/features/identity/trainer-self/application/queries/get-my-profile.ts`
- Create: `apps/web/features/identity/trainer-self/application/queries/list-my-competencies.ts`
- Create: `apps/web/features/identity/trainer-self/application/queries/get-competency-alerts.ts`

- [ ] **Step 1: Créer `ports.ts`**

```ts
// apps/web/features/identity/trainer-self/application/ports.ts
import type { TrainerProfile } from '../domain/trainer-profile';
import type { TrainerCompetency } from '../domain/trainer-competency';
import type { TrainerId, OrganizationId, CompetencyId } from '@/features/dossier/domain/ids';

export type TrainerMembership = {
  organizationId: OrganizationId;
  organizationName: string;
  trainerId: TrainerId;
  firstName: string;
  lastName: string;
  isInternal: boolean;
};

export interface MembershipReader {
  list(): Promise<TrainerMembership[]>;
  /** Idempotent — appelée au layout load. */
  linkOrphans(): Promise<number>;
}

export interface TrainerSelfRepository {
  findById(id: TrainerId): Promise<TrainerProfile | null>;
  saveMany(profiles: TrainerProfile[]): Promise<void>;
}

export interface TrainerCompetencyRepository {
  findById(id: CompetencyId): Promise<TrainerCompetency | null>;
  listByTrainer(trainerId: TrainerId): Promise<TrainerCompetency[]>;
  insertMany(competencies: TrainerCompetency[]): Promise<void>;
  remove(id: CompetencyId): Promise<void>;
}

export interface AvatarStorage {
  upload(userId: string, fileName: string, body: ArrayBuffer, contentType: string): Promise<string>;
  publicUrl(path: string): string;
}

export interface CompetencyStorage {
  upload(organizationId: string, trainerId: string, competencyId: string, fileName: string, body: ArrayBuffer, contentType: string): Promise<string>;
  remove(path: string): Promise<void>;
}
```

- [ ] **Step 2: Créer les 4 queries**

```ts
// apps/web/features/identity/trainer-self/application/queries/list-my-memberships.ts
import type { MembershipReader, TrainerMembership } from '../ports';

export class ListMyMembershipsQuery {
  constructor(private reader: MembershipReader) {}
  execute(): Promise<TrainerMembership[]> {
    return this.reader.list();
  }
}
```

```ts
// apps/web/features/identity/trainer-self/application/queries/get-my-profile.ts
import type { TrainerSelfRepository } from '../ports';
import { MembershipNotFound } from '../domain/errors';
import type { TrainerId } from '@/features/dossier/domain/ids';
import type { TrainerProfile } from '../domain/trainer-profile';

export class GetMyProfileQuery {
  constructor(private repo: TrainerSelfRepository) {}
  async execute(trainerId: TrainerId): Promise<TrainerProfile> {
    const p = await this.repo.findById(trainerId);
    if (!p) throw new MembershipNotFound(trainerId);
    return p;
  }
}
```

```ts
// apps/web/features/identity/trainer-self/application/queries/list-my-competencies.ts
import type { TrainerCompetencyRepository } from '../ports';
import type { TrainerId } from '@/features/dossier/domain/ids';
import type { TrainerCompetency } from '../domain/trainer-competency';

export class ListMyCompetenciesQuery {
  constructor(private repo: TrainerCompetencyRepository) {}
  execute(trainerId: TrainerId): Promise<TrainerCompetency[]> {
    return this.repo.listByTrainer(trainerId);
  }
}
```

```ts
// apps/web/features/identity/trainer-self/application/queries/get-competency-alerts.ts
import type { TrainerCompetencyRepository } from '../ports';
import type { TrainerId } from '@/features/dossier/domain/ids';

export class GetCompetencyAlertsQuery {
  constructor(private repo: TrainerCompetencyRepository) {}
  async execute(trainerId: TrainerId): Promise<{ expiringSoon: number; expired: number }> {
    const list = await this.repo.listByTrainer(trainerId);
    let expiringSoon = 0;
    let expired = 0;
    for (const c of list) {
      if (c.status === 'expiring_soon') expiringSoon++;
      else if (c.status === 'expired') expired++;
    }
    return { expiringSoon, expired };
  }
}
```

- [ ] **Step 3: Vérifier typecheck**

Run: `pnpm typecheck`
Expected: 0 erreur.

- [ ] **Step 4: Commit + push**

```bash
git add apps/web/features/identity/trainer-self/application/ports.ts apps/web/features/identity/trainer-self/application/queries/
git commit -m "feat(trainer-self/application): ports + 4 queries (memberships, profile, competencies, alerts)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>" -- apps/web/features/identity/trainer-self/application/
git push origin main
```

---

## Task 8: Application — Commands (TDD avec integration tests Supabase)

**Files:**
- Create: `apps/web/features/identity/trainer-self/application/commands/update-trainer-profile.ts`
- Create: `apps/web/features/identity/trainer-self/application/commands/add-competency.ts`
- Create: `apps/web/features/identity/trainer-self/application/commands/remove-competency.ts`
- Create: `apps/web/features/identity/trainer-self/application/commands/duplicate-competency-to-orgs.ts`
- Test: `apps/web/features/identity/trainer-self/application/commands/update-trainer-profile.unit.test.ts`

> Les commands sont testées en **unit** avec ports mockés (vraie suite integration → Task 13 E2E qui couvre le golden path bout-en-bout).

- [ ] **Step 1: Écrire test unit pour `UpdateTrainerProfile`**

```ts
// apps/web/features/identity/trainer-self/application/commands/update-trainer-profile.unit.test.ts
import { describe, it, expect, vi } from 'vitest';
import { UpdateTrainerProfile } from './update-trainer-profile';
import { TrainerProfile } from '../../domain/trainer-profile';
import { MembershipNotFound } from '../../domain/errors';
import type { TrainerSelfRepository } from '../ports';
import { TrainerId, OrganizationId, UserId } from '@/features/dossier/domain/ids';

const makeRepo = (profiles: TrainerProfile[]): TrainerSelfRepository => ({
  findById: vi.fn(async (id) => profiles.find(p => p.id === id) ?? null),
  saveMany: vi.fn(async () => {}),
});

const baseProps = {
  id: TrainerId('00000000-0000-0000-0000-00000000000a'),
  organizationId: OrganizationId('00000000-0000-0000-0000-0000000000aa'),
  userId: UserId('00000000-0000-0000-0000-000000000099'),
  firstName: 'Alice', lastName: 'Martin', email: 'alice@example.com',
  phone: null, bio: null, specialties: [], avatarPath: null, isInternal: true,
};

describe('UpdateTrainerProfile', () => {
  it('met à jour 1 profil', async () => {
    const p = TrainerProfile.hydrate(baseProps);
    const repo = makeRepo([p]);
    const cmd = new UpdateTrainerProfile(repo);

    await cmd.execute({
      trainerIds: [TrainerId('00000000-0000-0000-0000-00000000000a')],
      patch: { bio: 'Hello' },
    });

    expect(repo.saveMany).toHaveBeenCalledTimes(1);
    const saved = (repo.saveMany as any).mock.calls[0][0];
    expect(saved[0].bio).toBe('Hello');
  });

  it('met à jour N profils en batch', async () => {
    const p1 = TrainerProfile.hydrate({ ...baseProps, id: TrainerId('00000000-0000-0000-0000-00000000000a') });
    const p2 = TrainerProfile.hydrate({ ...baseProps, id: TrainerId('00000000-0000-0000-0000-00000000000b') });
    const repo = makeRepo([p1, p2]);
    const cmd = new UpdateTrainerProfile(repo);

    await cmd.execute({
      trainerIds: [TrainerId('00000000-0000-0000-0000-00000000000a'), TrainerId('00000000-0000-0000-0000-00000000000b')],
      patch: { specialties: ['fr', 'qualiopi'] },
    });

    const saved = (repo.saveMany as any).mock.calls[0][0];
    expect(saved).toHaveLength(2);
    expect(saved[0].specialties).toEqual(['fr', 'qualiopi']);
    expect(saved[1].specialties).toEqual(['fr', 'qualiopi']);
  });

  it('raise MembershipNotFound si un trainerId est inconnu', async () => {
    const repo = makeRepo([]);
    const cmd = new UpdateTrainerProfile(repo);
    await expect(cmd.execute({
      trainerIds: [TrainerId('00000000-0000-0000-0000-deadbeefdead')],
      patch: { bio: 'X' },
    })).rejects.toThrow(MembershipNotFound);
  });
});
```

- [ ] **Step 2: Run, échec**

Run: `pnpm --filter web test update-trainer-profile`
Expected: échec — `UpdateTrainerProfile` introuvable.

- [ ] **Step 3: Implémenter `UpdateTrainerProfile`**

```ts
// apps/web/features/identity/trainer-self/application/commands/update-trainer-profile.ts
import type { TrainerSelfRepository } from '../ports';
import type { TrainerProfilePatch } from '../../domain/trainer-profile';
import { MembershipNotFound } from '../../domain/errors';
import type { TrainerId } from '@/features/dossier/domain/ids';

export type UpdateTrainerProfileInput = {
  trainerIds: TrainerId[];
  patch: TrainerProfilePatch;
};

export class UpdateTrainerProfile {
  constructor(private repo: TrainerSelfRepository) {}

  async execute(input: UpdateTrainerProfileInput): Promise<void> {
    const profiles = await Promise.all(input.trainerIds.map(id => this.repo.findById(id)));
    const idx = profiles.findIndex(p => p === null);
    if (idx !== -1) throw new MembershipNotFound(input.trainerIds[idx]);

    for (const p of profiles) p!.applyPatch(input.patch);
    await this.repo.saveMany(profiles as NonNullable<(typeof profiles)[number]>[]);
  }
}
```

- [ ] **Step 4: Run, PASS**

Run: `pnpm --filter web test update-trainer-profile`
Expected: PASS 3/3.

- [ ] **Step 5: Implémenter les 3 autres commands (mêmes patterns, pas de test unit obligatoire si la logique est triviale — couverture E2E suffit)**

```ts
// apps/web/features/identity/trainer-self/application/commands/add-competency.ts
import type { TrainerCompetencyRepository, CompetencyStorage } from '../ports';
import { TrainerCompetency, type CompetencyKind } from '../../domain/trainer-competency';
import { UploadFailed } from '../../domain/errors';
import { CompetencyId, TrainerId, OrganizationId } from '@/features/dossier/domain/ids';
import { uuidv7 } from 'uuidv7';

export type AddCompetencyInput = {
  trainerId: TrainerId;
  organizationId: OrganizationId;
  kind: CompetencyKind;
  title: string;
  issuer?: string | null;
  obtainedAt?: Date | null;
  expiresAt?: Date | null;
  file?: { name: string; body: ArrayBuffer; contentType: string };
};

export class AddCompetency {
  constructor(
    private repo: TrainerCompetencyRepository,
    private storage: CompetencyStorage,
  ) {}

  async execute(input: AddCompetencyInput): Promise<CompetencyId> {
    const id = CompetencyId(uuidv7());
    let documentPath: string | null = null;

    if (input.file) {
      try {
        documentPath = await this.storage.upload(
          input.organizationId, input.trainerId, id,
          input.file.name, input.file.body, input.file.contentType,
        );
      } catch (e) {
        throw new UploadFailed(e instanceof Error ? e.message : String(e));
      }
    }

    const c = TrainerCompetency.create({
      id, trainerId: input.trainerId,
      kind: input.kind, title: input.title.trim(),
      issuer: input.issuer ?? null,
      obtainedAt: input.obtainedAt ?? null,
      expiresAt: input.expiresAt ?? null,
      documentPath,
    });

    await this.repo.insertMany([c]);
    return id;
  }
}
```

```ts
// apps/web/features/identity/trainer-self/application/commands/remove-competency.ts
import type { TrainerCompetencyRepository, CompetencyStorage } from '../ports';
import { CompetencyNotFound } from '../../domain/errors';
import type { CompetencyId } from '@/features/dossier/domain/ids';

export class RemoveCompetency {
  constructor(
    private repo: TrainerCompetencyRepository,
    private storage: CompetencyStorage,
  ) {}

  async execute(id: CompetencyId): Promise<void> {
    const c = await this.repo.findById(id);
    if (!c) throw new CompetencyNotFound(id);
    if (c.documentPath) {
      await this.storage.remove(c.documentPath);
    }
    await this.repo.remove(id);
  }
}
```

```ts
// apps/web/features/identity/trainer-self/application/commands/duplicate-competency-to-orgs.ts
import type { TrainerCompetencyRepository, MembershipReader } from '../ports';
import { TrainerCompetency } from '../../domain/trainer-competency';
import { CompetencyNotFound, MembershipNotFound } from '../../domain/errors';
import { CompetencyId, OrganizationId, TrainerId } from '@/features/dossier/domain/ids';
import { uuidv7 } from 'uuidv7';

export type DuplicateCompetencyInput = {
  sourceCompetencyId: CompetencyId;
  targetOrganizationIds: OrganizationId[];
};

export class DuplicateCompetencyToOrgs {
  constructor(
    private repo: TrainerCompetencyRepository,
    private memberships: MembershipReader,
  ) {}

  async execute(input: DuplicateCompetencyInput): Promise<CompetencyId[]> {
    const source = await this.repo.findById(input.sourceCompetencyId);
    if (!source) throw new CompetencyNotFound(input.sourceCompetencyId);

    const all = await this.memberships.list();
    const targets = all.filter(m => input.targetOrganizationIds.includes(m.organizationId));
    if (targets.length === 0) throw new MembershipNotFound('no target memberships');

    const clones = targets.map(m => TrainerCompetency.hydrate({
      id: CompetencyId(uuidv7()),
      trainerId: m.trainerId,
      kind: source.kind,
      title: source.title,
      issuer: source.issuer,
      obtainedAt: source.obtainedAt,
      expiresAt: source.expiresAt,
      documentPath: source.documentPath, // partagé, pas de re-upload
    }));

    await this.repo.insertMany(clones);
    return clones.map(c => c.id);
  }
}
```

- [ ] **Step 6: Vérifier typecheck**

Run: `pnpm typecheck`
Expected: 0 erreur.

- [ ] **Step 7: Commit + push**

```bash
git add apps/web/features/identity/trainer-self/application/commands/
git commit -m "feat(trainer-self/application): 4 commands (update profile, add/remove/duplicate competency)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>" -- apps/web/features/identity/trainer-self/application/commands/
git push origin main
```

---

## Task 9: Infrastructure — Supabase repositories + readers + storage

**Files:**
- Create: `apps/web/features/identity/trainer-self/infrastructure/supabase-trainer-self.repository.ts`
- Create: `apps/web/features/identity/trainer-self/infrastructure/supabase-trainer-competency.repository.ts`
- Create: `apps/web/features/identity/trainer-self/infrastructure/supabase-membership.reader.ts`
- Create: `apps/web/features/identity/trainer-self/infrastructure/supabase-avatar.storage.ts`
- Create: `apps/web/features/identity/trainer-self/infrastructure/supabase-competency.storage.ts`

> Aucun test unit ici — l'infra est une couche d'adaptation directe. Tests via Task 13 E2E.

- [ ] **Step 1: `supabase-membership.reader.ts`**

```ts
// apps/web/features/identity/trainer-self/infrastructure/supabase-membership.reader.ts
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/shared/types/database';
import type { MembershipReader, TrainerMembership } from '../application/ports';
import { OrganizationId, TrainerId } from '@/features/dossier/domain/ids';

export class SupabaseMembershipReader implements MembershipReader {
  constructor(private supabase: SupabaseClient<Database>) {}

  async list(): Promise<TrainerMembership[]> {
    const { data, error } = await this.supabase.rpc('list_my_trainer_memberships');
    if (error) throw error;
    return (data ?? []).map(r => ({
      organizationId: OrganizationId(r.organization_id),
      organizationName: r.organization_name,
      trainerId: TrainerId(r.trainer_id),
      firstName: r.first_name,
      lastName: r.last_name,
      isInternal: r.is_internal,
    }));
  }

  async linkOrphans(): Promise<number> {
    const { data, error } = await this.supabase.rpc('link_my_trainer_rows');
    if (error) throw error;
    return data ?? 0;
  }
}
```

- [ ] **Step 2: `supabase-trainer-self.repository.ts`**

```ts
// apps/web/features/identity/trainer-self/infrastructure/supabase-trainer-self.repository.ts
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/shared/types/database';
import type { TrainerSelfRepository } from '../application/ports';
import { TrainerProfile } from '../domain/trainer-profile';
import { OrganizationId, TrainerId, UserId } from '@/features/dossier/domain/ids';

export class SupabaseTrainerSelfRepository implements TrainerSelfRepository {
  constructor(private supabase: SupabaseClient<Database>) {}

  async findById(id: TrainerId): Promise<TrainerProfile | null> {
    const { data, error } = await this.supabase
      .schema('app')
      .from('trainers')
      .select('id, organization_id, user_id, first_name, last_name, email, phone, bio, specialties, is_internal, metadata')
      .eq('id', id)
      .is('deleted_at', null)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;

    const metadata = (data.metadata ?? {}) as { avatar_path?: string };
    return TrainerProfile.hydrate({
      id: TrainerId(data.id),
      organizationId: OrganizationId(data.organization_id),
      userId: UserId(data.user_id!),
      firstName: data.first_name,
      lastName: data.last_name,
      email: data.email,
      phone: data.phone,
      bio: data.bio,
      specialties: data.specialties ?? [],
      avatarPath: metadata.avatar_path ?? null,
      isInternal: data.is_internal,
    });
  }

  async saveMany(profiles: TrainerProfile[]): Promise<void> {
    // PostgREST ne fait pas de transaction multi-row par défaut → on UPDATE 1 par 1.
    // Acceptable : N petit (≤10), erreur RLS = partiel rollback côté domaine, ok pour V1.
    for (const p of profiles) {
      const dto = p.toPersistence();
      const { error } = await this.supabase
        .schema('app')
        .from('trainers')
        .update({
          first_name: dto.first_name,
          last_name: dto.last_name,
          phone: dto.phone,
          bio: dto.bio,
          specialties: dto.specialties,
          metadata: dto.metadata,
        })
        .eq('id', dto.id);
      if (error) throw error;
    }
  }
}
```

- [ ] **Step 3: `supabase-trainer-competency.repository.ts`**

```ts
// apps/web/features/identity/trainer-self/infrastructure/supabase-trainer-competency.repository.ts
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/shared/types/database';
import type { TrainerCompetencyRepository } from '../application/ports';
import { TrainerCompetency } from '../domain/trainer-competency';
import { CompetencyId, TrainerId } from '@/features/dossier/domain/ids';

export class SupabaseTrainerCompetencyRepository implements TrainerCompetencyRepository {
  constructor(private supabase: SupabaseClient<Database>) {}

  async findById(id: CompetencyId): Promise<TrainerCompetency | null> {
    const { data, error } = await this.supabase
      .schema('app').from('trainer_competencies')
      .select('id, trainer_id, kind, title, issuer, obtained_at, expires_at, document_path, organization_id')
      .eq('id', id).maybeSingle();
    if (error) throw error;
    return data ? this.toDomain(data) : null;
  }

  async listByTrainer(trainerId: TrainerId): Promise<TrainerCompetency[]> {
    const { data, error } = await this.supabase
      .schema('app').from('trainer_competencies')
      .select('id, trainer_id, kind, title, issuer, obtained_at, expires_at, document_path, organization_id')
      .eq('trainer_id', trainerId)
      .order('obtained_at', { ascending: false, nullsFirst: false });
    if (error) throw error;
    return (data ?? []).map(this.toDomain);
  }

  async insertMany(competencies: TrainerCompetency[]): Promise<void> {
    if (competencies.length === 0) return;
    // organization_id requis par la table — récupéré depuis trainer
    const rows = await Promise.all(competencies.map(async c => {
      const { data, error } = await this.supabase.schema('app').from('trainers')
        .select('organization_id').eq('id', c.trainerId).single();
      if (error) throw error;
      return { ...c.toPersistence(), organization_id: data.organization_id };
    }));
    const { error } = await this.supabase.schema('app')
      .from('trainer_competencies').insert(rows);
    if (error) throw error;
  }

  async remove(id: CompetencyId): Promise<void> {
    const { error } = await this.supabase.schema('app')
      .from('trainer_competencies').delete().eq('id', id);
    if (error) throw error;
  }

  private toDomain(row: any): TrainerCompetency {
    return TrainerCompetency.hydrate({
      id: CompetencyId(row.id),
      trainerId: TrainerId(row.trainer_id),
      kind: row.kind,
      title: row.title,
      issuer: row.issuer,
      obtainedAt: row.obtained_at ? new Date(row.obtained_at) : null,
      expiresAt: row.expires_at ? new Date(row.expires_at) : null,
      documentPath: row.document_path,
    });
  }
}
```

- [ ] **Step 4: Storage adapters**

```ts
// apps/web/features/identity/trainer-self/infrastructure/supabase-avatar.storage.ts
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/shared/types/database';
import type { AvatarStorage } from '../application/ports';
import { env } from '@/env.mjs';

const BUCKET = 'avatars';

export class SupabaseAvatarStorage implements AvatarStorage {
  constructor(private supabase: SupabaseClient<Database>) {}

  async upload(userId: string, fileName: string, body: ArrayBuffer, contentType: string): Promise<string> {
    const ext = fileName.includes('.') ? fileName.split('.').pop()!.toLowerCase() : 'png';
    const path = `${userId}/avatar.${ext}`;
    const { error } = await this.supabase.storage.from(BUCKET).upload(path, body, {
      contentType, upsert: true,
    });
    if (error) throw error;
    return path;
  }

  publicUrl(path: string): string {
    const { data } = this.supabase.storage.from(BUCKET).getPublicUrl(path);
    return data.publicUrl;
  }
}
```

```ts
// apps/web/features/identity/trainer-self/infrastructure/supabase-competency.storage.ts
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/shared/types/database';
import type { CompetencyStorage } from '../application/ports';

const BUCKET = 'trainer-cvs';

export class SupabaseCompetencyStorage implements CompetencyStorage {
  constructor(private supabase: SupabaseClient<Database>) {}

  async upload(orgId: string, trainerId: string, competencyId: string, fileName: string, body: ArrayBuffer, contentType: string): Promise<string> {
    const ext = fileName.includes('.') ? fileName.split('.').pop()!.toLowerCase() : 'pdf';
    const path = `${orgId}/${trainerId}/${competencyId}.${ext}`;
    const { error } = await this.supabase.storage.from(BUCKET).upload(path, body, {
      contentType, upsert: false,
    });
    if (error) throw error;
    return path;
  }

  async remove(path: string): Promise<void> {
    const { error } = await this.supabase.storage.from(BUCKET).remove([path]);
    if (error) throw error;
  }
}
```

- [ ] **Step 5: typecheck + commit + push**

Run: `pnpm typecheck`
Expected: 0 erreur.

```bash
git add apps/web/features/identity/trainer-self/infrastructure/
git commit -m "feat(trainer-self/infra): Supabase repositories + readers + storage adapters

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>" -- apps/web/features/identity/trainer-self/infrastructure/
git push origin main
```

---

## Task 10: UI Foundation — Zod schemas + FormateurHeader + OfSwitcher

**Files:**
- Create: `apps/web/features/identity/trainer-self/ui/schemas.ts`
- Create: `apps/web/features/identity/trainer-self/ui/formateur-header.tsx`
- Create: `apps/web/features/identity/trainer-self/ui/of-switcher.tsx`
- Create: `apps/web/app/(formateur)/api/set-focus/route.ts`
- Modify: `apps/web/app/(formateur)/layout.tsx`

- [ ] **Step 1: Schémas Zod partagés**

```ts
// apps/web/features/identity/trainer-self/ui/schemas.ts
import { z } from 'zod';

export const TrainerProfilePatchSchema = z.object({
  firstName: z.string().trim().min(1, 'Prénom requis').max(100).optional(),
  lastName: z.string().trim().min(1, 'Nom requis').max(100).optional(),
  phone: z.string().trim().max(30).nullable().optional(),
  bio: z.string().trim().max(2000).nullable().optional(),
  specialties: z.array(z.string().trim().min(1).max(50)).max(12).optional(),
  avatarPath: z.string().nullable().optional(),
});

export const UpdateProfileSchema = z.object({
  trainerIds: z.array(z.string().uuid()).min(1).max(10),
  patch: TrainerProfilePatchSchema,
});

export const CompetencyKindSchema = z.enum(['diploma', 'certification', 'experience', 'cv']);

export const AddCompetencySchema = z.object({
  trainerId: z.string().uuid(),
  organizationId: z.string().uuid(),
  kind: CompetencyKindSchema,
  title: z.string().trim().min(1).max(200),
  issuer: z.string().trim().max(200).nullable().optional(),
  obtainedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  expiresAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
});

export const RemoveCompetencySchema = z.object({
  competencyId: z.string().uuid(),
});

export const DuplicateCompetencySchema = z.object({
  sourceCompetencyId: z.string().uuid(),
  targetOrganizationIds: z.array(z.string().uuid()).min(1).max(10),
});
```

- [ ] **Step 2: Cookie focus — Route Handler**

```ts
// apps/web/app/(formateur)/api/set-focus/route.ts
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const Body = z.object({
  organizationId: z.string().uuid().or(z.literal('all')),
});

export async function POST(req: Request) {
  const body = await req.json();
  const parsed = Body.safeParse(body);
  if (!parsed.success) return NextResponse.json({ ok: false }, { status: 400 });

  cookies().set('of_focus', parsed.data.organizationId, {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 365, // 1 an
    path: '/',
  });
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 3: `OfSwitcher` (Client)**

> shadcn `Popover` n'est pas confirmé installé ; on utilise un `<details>` natif si pas dispo. Le projet a déjà des patterns shadcn (cf. CLAUDE.md). Vérifier `apps/web/shared/ui/` pour Popover ; sinon utiliser un toggle simple.

```tsx
// apps/web/features/identity/trainer-self/ui/of-switcher.tsx
'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Check, ChevronDown, Building2 } from 'lucide-react';
import { cn } from '@/shared/lib/cn';
import type { TrainerMembership } from '@/features/identity/trainer-self/application/ports';

// Palette déterministe (zinc/orange/rose/blue/purple/emerald)
const PALETTE = ['orange', 'rose', 'blue', 'purple', 'emerald', 'amber'] as const;
function colorFor(orgId: string): string {
  let h = 0;
  for (let i = 0; i < orgId.length; i++) h = (h * 31 + orgId.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length]!;
}

export function OfSwitcher({
  memberships,
  current,
}: {
  memberships: TrainerMembership[];
  current: string; // organizationId | 'all'
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  if (memberships.length <= 1) {
    const only = memberships[0];
    if (!only) return null;
    return (
      <div className="inline-flex items-center gap-1.5 text-[12px] text-zinc-600 dark:text-zinc-400">
        <Building2 className="w-3.5 h-3.5" />
        <span>{only.organizationName}</span>
      </div>
    );
  }

  const currentLabel =
    current === 'all' ? 'Tous mes OF'
    : memberships.find(m => m.organizationId === current)?.organizationName ?? 'Tous mes OF';

  const setFocus = (orgId: string) => {
    startTransition(async () => {
      await fetch('/api/set-focus', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ organizationId: orgId }),
      });
      router.refresh();
      setOpen(false);
    });
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        disabled={pending}
        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-zinc-200/60 dark:border-zinc-800 text-[12px] hover:bg-zinc-50 dark:hover:bg-zinc-900 transition"
      >
        <Building2 className="w-3.5 h-3.5 text-zinc-500" />
        <span className="font-medium">{currentLabel}</span>
        <ChevronDown className="w-3 h-3 text-zinc-400" />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1.5 min-w-[260px] bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-md z-50">
          <button
            type="button"
            onClick={() => setFocus('all')}
            className={cn(
              'w-full text-left px-3 py-2 flex items-center gap-2 text-[13px] hover:bg-zinc-50 dark:hover:bg-zinc-900 transition first:rounded-t-xl',
              current === 'all' && 'bg-zinc-50 dark:bg-zinc-900',
            )}
          >
            <span className="flex -space-x-1">
              {memberships.slice(0, 3).map(m => (
                <span key={m.organizationId} className={`w-2 h-2 rounded-full bg-${colorFor(m.organizationId)}-400 ring-1 ring-white dark:ring-zinc-950`} />
              ))}
            </span>
            <span className="flex-1">Tous mes OF</span>
            {current === 'all' && <Check className="w-3.5 h-3.5 text-zinc-500" />}
          </button>
          <div className="border-t border-zinc-100 dark:border-zinc-900" />
          {memberships.map(m => (
            <button
              key={m.organizationId}
              type="button"
              onClick={() => setFocus(m.organizationId)}
              className={cn(
                'w-full text-left px-3 py-2 flex items-center gap-2 text-[13px] hover:bg-zinc-50 dark:hover:bg-zinc-900 transition last:rounded-b-xl',
                current === m.organizationId && 'bg-zinc-50 dark:bg-zinc-900',
              )}
            >
              <span className={`w-2 h-2 rounded-full bg-${colorFor(m.organizationId)}-400`} />
              <span className="flex-1">
                {m.organizationName}
                {m.isInternal && <span className="ml-1.5 text-[10px] text-zinc-400">interne</span>}
              </span>
              {current === m.organizationId && <Check className="w-3.5 h-3.5 text-zinc-500" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
```

> **Important pour Tailwind JIT** : les classes dynamiques `bg-${color}-400` doivent être ajoutées en safelist dans `tailwind.config.ts` :
>
> ```ts
> safelist: [
>   { pattern: /bg-(orange|rose|blue|purple|emerald|amber)-(300|400)/ },
> ],
> ```

- [ ] **Step 4: `FormateurHeader` (Server Component) — composition avec layout**

```tsx
// apps/web/features/identity/trainer-self/ui/formateur-header.tsx
import 'server-only';
import Link from 'next/link';
import { cookies } from 'next/headers';
import { ArrowLeft } from 'lucide-react';
import { OfSwitcher } from './of-switcher';
import type { TrainerMembership } from '../application/ports';

export function FormateurHeader({ memberships }: { memberships: TrainerMembership[] }) {
  const focus = cookies().get('of_focus')?.value ?? 'all';

  return (
    <header className="px-4 py-3 border-b border-zinc-200/60 dark:border-zinc-800 flex items-center justify-between gap-3">
      <Link
        href="/"
        className="text-[11px] text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 inline-flex items-center gap-1.5 transition"
      >
        <ArrowLeft className="w-3 h-3" />
        Espace OF
      </Link>
      <span className="text-[11px] tracking-wider uppercase text-zinc-400 dark:text-zinc-500 hidden sm:inline">
        Espace formateur
      </span>
      <div className="flex items-center gap-2">
        <OfSwitcher memberships={memberships} current={focus} />
      </div>
    </header>
  );
}
```

- [ ] **Step 5: Modifier `app/(formateur)/layout.tsx`**

```tsx
// apps/web/app/(formateur)/layout.tsx
// ARCHETYPE: shared (mobile-first formateur)
import { redirect } from 'next/navigation';
import { supabaseServer } from '@/shared/lib/supabase/server';
import { SupabaseMembershipReader } from '@/features/identity/trainer-self/infrastructure/supabase-membership.reader';
import { FormateurHeader } from '@/features/identity/trainer-self/ui/formateur-header';

export default async function FormateurLayout({ children }: { children: React.ReactNode }) {
  const supabase = supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/auth/login?next=/formateur');

  const reader = new SupabaseMembershipReader(supabase);
  await reader.linkOrphans(); // idempotent, ~1ms si rien à link
  const memberships = await reader.list();

  if (memberships.length === 0) {
    redirect('/?reason=no-trainer-membership');
  }

  return (
    <div className="min-h-screen bg-white dark:bg-zinc-950 flex flex-col">
      <FormateurHeader memberships={memberships} />
      <main className="flex-1">{children}</main>
    </div>
  );
}
```

- [ ] **Step 6: Vérifier typecheck + lint**

Run: `pnpm typecheck && pnpm lint`
Expected: 0 erreur.

- [ ] **Step 7: Commit + push**

```bash
git add apps/web/features/identity/trainer-self/ui/schemas.ts apps/web/features/identity/trainer-self/ui/formateur-header.tsx apps/web/features/identity/trainer-self/ui/of-switcher.tsx apps/web/app/(formateur)/api/set-focus/route.ts apps/web/app/(formateur)/layout.tsx
git commit -m "feat(formateur/ui): shell layout + FormateurHeader + OfSwitcher + cookie focus

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>" -- apps/web/features/identity/trainer-self/ui/schemas.ts apps/web/features/identity/trainer-self/ui/formateur-header.tsx apps/web/features/identity/trainer-self/ui/of-switcher.tsx apps/web/app/(formateur)/api/set-focus/route.ts apps/web/app/(formateur)/layout.tsx
git push origin main
```

> **Note safelist Tailwind** : si la palette colorée du switcher n'apparaît pas, ajouter la safelist mentionnée Step 3 dans `apps/web/tailwind.config.ts` et faire un commit séparé.

---

## Task 11: Dashboard `/(formateur)/page.tsx`

**Files:**
- Create: `apps/web/app/(formateur)/page.tsx`

- [ ] **Step 1: Implémenter le dashboard**

```tsx
// apps/web/app/(formateur)/page.tsx
// ARCHETYPE: workflow
import Link from 'next/link';
import { cookies } from 'next/headers';
import { supabaseServer } from '@/shared/lib/supabase/server';
import { SupabaseMembershipReader } from '@/features/identity/trainer-self/infrastructure/supabase-membership.reader';
import { SupabaseTrainerCompetencyRepository } from '@/features/identity/trainer-self/infrastructure/supabase-trainer-competency.repository';
import { GetCompetencyAlertsQuery } from '@/features/identity/trainer-self/application/queries/get-competency-alerts';
import { Calendar, ClipboardList, FileText, GraduationCap, AlertTriangle } from 'lucide-react';

export default async function FormateurDashboard() {
  const supabase = supabaseServer();
  const reader = new SupabaseMembershipReader(supabase);
  const memberships = await reader.list();
  const focus = cookies().get('of_focus')?.value ?? 'all';

  const visible = focus === 'all' ? memberships : memberships.filter(m => m.organizationId === focus);

  const compRepo = new SupabaseTrainerCompetencyRepository(supabase);
  const alertsQuery = new GetCompetencyAlertsQuery(compRepo);
  const alerts = await Promise.all(visible.map(m => alertsQuery.execute(m.trainerId)));
  const totalExpiring = alerts.reduce((s, a) => s + a.expiringSoon, 0);
  const totalExpired  = alerts.reduce((s, a) => s + a.expired, 0);

  const firstName = visible[0]?.firstName ?? '';

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
      {/* Hero */}
      <section className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-orange-50 to-rose-50 dark:from-orange-950/30 dark:to-rose-950/20 p-6 shadow-sm border border-orange-100/50 dark:border-orange-900/30">
        <h1 className="text-[24px] font-semibold text-zinc-900 dark:text-zinc-100 leading-tight">
          Bonjour {firstName} 👋
        </h1>
        <p className="text-[13px] text-zinc-600 dark:text-zinc-400 mt-1">
          Vous êtes formateur chez <strong>{visible.length}</strong> organisme{visible.length > 1 ? 's' : ''} de formation
          {focus !== 'all' && ' (filtré)'}.
        </p>
        {(totalExpiring > 0 || totalExpired > 0) && (
          <div className="mt-4 inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-white/70 dark:bg-zinc-950/40 border border-purple-200 dark:border-purple-900/40 text-[12px]">
            <AlertTriangle className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
            <span>
              {totalExpired > 0 && <><strong className="text-red-700 dark:text-red-300">{totalExpired}</strong> compétence{totalExpired > 1 ? 's' : ''} expirée{totalExpired > 1 ? 's' : ''}</>}
              {totalExpiring > 0 && totalExpired > 0 && ' · '}
              {totalExpiring > 0 && <><strong className="text-purple-700 dark:text-purple-300">{totalExpiring}</strong> bientôt expirée{totalExpiring > 1 ? 's' : ''}</>}
            </span>
            <Link href="/cv" className="ml-2 text-orange-600 dark:text-orange-400 hover:underline">Mettre à jour →</Link>
          </div>
        )}
      </section>

      {/* Mes OFs */}
      {memberships.length > 1 && (
        <section>
          <h2 className="text-[15px] font-medium text-zinc-900 dark:text-zinc-100 mb-3">Mes organismes</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {visible.map((m, i) => (
              <div key={m.trainerId} className="p-4 rounded-xl border border-zinc-200/60 dark:border-zinc-800 bg-white dark:bg-zinc-950 shadow-sm">
                <div className="flex items-center justify-between">
                  <h3 className="text-[14px] font-medium text-zinc-900 dark:text-zinc-100">{m.organizationName}</h3>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded ${m.isInternal ? 'bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300' : 'bg-zinc-100 text-zinc-600 dark:bg-zinc-900 dark:text-zinc-400'}`}>
                    {m.isInternal ? 'Interne' : 'Externe'}
                  </span>
                </div>
                <p className="text-[11px] text-zinc-500 dark:text-zinc-500 mt-1">
                  {alerts[i]!.expired + alerts[i]!.expiringSoon === 0 ? 'Profil OK' : 'Compétences à vérifier'}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Raccourcis */}
      <section>
        <h2 className="text-[15px] font-medium text-zinc-900 dark:text-zinc-100 mb-3">Raccourcis</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <ShortcutCard href="/profil" icon={<GraduationCap className="w-4 h-4" />} label="Mon profil" />
          <ShortcutCard href="/cv" icon={<FileText className="w-4 h-4" />} label="Mon CV" />
          <ShortcutCard href="/mes-sessions" icon={<Calendar className="w-4 h-4" />} label="Mes sessions" subtle />
          <ShortcutCard href="/emarger" icon={<ClipboardList className="w-4 h-4" />} label="Émargements" subtle />
        </div>
      </section>
    </div>
  );
}

function ShortcutCard({ href, icon, label, subtle }: { href: string; icon: React.ReactNode; label: string; subtle?: boolean }) {
  return (
    <Link
      href={href}
      className={`p-3 rounded-xl border border-zinc-200/60 dark:border-zinc-800 ${subtle ? 'bg-zinc-50/50 dark:bg-zinc-950/50' : 'bg-white dark:bg-zinc-950'} hover:shadow-md transition flex flex-col items-start gap-1.5`}
    >
      <span className="text-zinc-600 dark:text-zinc-400">{icon}</span>
      <span className="text-[12px] font-medium text-zinc-900 dark:text-zinc-100">{label}</span>
    </Link>
  );
}
```

- [ ] **Step 2: Lancer dev + vérifier visuellement**

Run: `pnpm dev`
Aller sur `http://localhost:3000/formateur` (après avoir seedé un user avec ≥1 trainer membership).
Expected : hero card, liste OFs (si N≥2), 4 raccourcis. Mobile-first (tester avec devtools).

- [ ] **Step 3: Commit + push**

```bash
git add apps/web/app/\(formateur\)/page.tsx
git commit -m "feat(formateur): dashboard d'accueil (hero + memberships + raccourcis)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>" -- "apps/web/app/(formateur)/page.tsx"
git push origin main
```

---

## Task 12: Page Profil + Server Action

**Files:**
- Create: `apps/web/features/identity/trainer-self/ui/profile-form.tsx`
- Create: `apps/web/app/(formateur)/profil/page.tsx`
- Create: `apps/web/app/(formateur)/profil/actions.ts`

- [ ] **Step 1: Server Action `updateProfileAction`**

```ts
// apps/web/app/(formateur)/profil/actions.ts
'use server';

import { revalidatePath } from 'next/cache';
import { authActionClient } from '@/shared/lib/safe-action';
import { UpdateProfileSchema } from '@/features/identity/trainer-self/ui/schemas';
import { SupabaseTrainerSelfRepository } from '@/features/identity/trainer-self/infrastructure/supabase-trainer-self.repository';
import { UpdateTrainerProfile } from '@/features/identity/trainer-self/application/commands/update-trainer-profile';
import { TrainerId } from '@/features/dossier/domain/ids';

export const updateProfileAction = authActionClient
  .metadata({ name: 'updateProfileAction' })
  .schema(UpdateProfileSchema)
  .action(async ({ parsedInput, ctx }) => {
    const repo = new SupabaseTrainerSelfRepository(ctx.supabase);
    const cmd = new UpdateTrainerProfile(repo);
    await cmd.execute({
      trainerIds: parsedInput.trainerIds.map(TrainerId),
      patch: {
        firstName: parsedInput.patch.firstName,
        lastName: parsedInput.patch.lastName,
        phone: parsedInput.patch.phone,
        bio: parsedInput.patch.bio,
        specialties: parsedInput.patch.specialties,
        avatarPath: parsedInput.patch.avatarPath,
      },
    });
    revalidatePath('/profil');
    return { ok: true };
  });
```

- [ ] **Step 2: Form Client Component**

```tsx
// apps/web/features/identity/trainer-self/ui/profile-form.tsx
'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useAction } from 'next-safe-action/hooks';
import { z } from 'zod';
import { useState } from 'react';
import { Save, Loader2 } from 'lucide-react';
import { FormField, inputClass } from '@/shared/ui/form-field';
import { TrainerProfilePatchSchema } from './schemas';
import { updateProfileAction } from '@/app/(formateur)/profil/actions';
import type { TrainerMembership } from '../application/ports';

const FormSchema = TrainerProfilePatchSchema.required({ firstName: true, lastName: true });
type FormValues = z.infer<typeof FormSchema>;

export function ProfileForm({
  memberships,
  initial,
  activeTrainerIds,
}: {
  memberships: TrainerMembership[];
  initial: FormValues & { email: string; isInternal: boolean };
  activeTrainerIds: string[];
}) {
  const [applyToAll, setApplyToAll] = useState(false);
  const action = useAction(updateProfileAction);

  const { register, handleSubmit, formState } = useForm<FormValues>({
    resolver: zodResolver(FormSchema),
    defaultValues: initial,
  });

  const onSubmit = (data: FormValues) => {
    const trainerIds = applyToAll
      ? memberships.map(m => m.trainerId)
      : activeTrainerIds;
    action.execute({ trainerIds, patch: data });
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5 max-w-xl">
      <div className="grid grid-cols-2 gap-3">
        <FormField label="Prénom" required>
          <input className={inputClass} {...register('firstName')} />
        </FormField>
        <FormField label="Nom" required>
          <input className={inputClass} {...register('lastName')} />
        </FormField>
      </div>

      <FormField label="Email" hint="Modifiable uniquement par l'admin de l'OF">
        <input className={inputClass + ' opacity-60 cursor-not-allowed'} value={initial.email} disabled />
      </FormField>

      <FormField label="Téléphone">
        <input className={inputClass} {...register('phone')} placeholder="+33 6 12 34 56 78" />
      </FormField>

      <FormField label="Bio" hint="Max 2000 caractères">
        <textarea className={inputClass + ' min-h-[100px]'} {...register('bio')} maxLength={2000} />
      </FormField>

      <FormField label="Spécialités" hint="12 max — séparées par virgule">
        <input
          className={inputClass}
          placeholder="qualiopi, anglais, vente"
          defaultValue={initial.specialties?.join(', ') ?? ''}
          onChange={e => {
            const arr = e.target.value.split(',').map(s => s.trim()).filter(Boolean).slice(0, 12);
            (e.target as any)._specialties = arr;
          }}
          {...register('specialties', { setValueAs: (v: string) =>
            typeof v === 'string' ? v.split(',').map(s => s.trim()).filter(Boolean).slice(0, 12) : v
          })}
        />
      </FormField>

      {memberships.length > 1 && (
        <label className="flex items-start gap-2 text-[12px] text-zinc-600 dark:text-zinc-400">
          <input
            type="checkbox"
            checked={applyToAll}
            onChange={e => setApplyToAll(e.target.checked)}
            className="mt-0.5"
          />
          <span>Appliquer ces modifications à mes <strong>{memberships.length}</strong> organismes (sinon seulement l'OF actif)</span>
        </label>
      )}

      <div className="flex items-center gap-3 pt-2">
        <button
          type="submit"
          disabled={action.isExecuting || !formState.isDirty}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-orange-500 text-white text-[13px] font-medium hover:bg-orange-600 disabled:opacity-50 shadow-sm transition"
        >
          {action.isExecuting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Enregistrer
        </button>
        {action.result?.data?.ok && <span className="text-[12px] text-emerald-600 dark:text-emerald-400">Enregistré ✓</span>}
        {action.result?.serverError && <span className="text-[12px] text-red-600 dark:text-red-400">{String(action.result.serverError)}</span>}
      </div>
    </form>
  );
}
```

- [ ] **Step 3: Page Profil**

```tsx
// apps/web/app/(formateur)/profil/page.tsx
// ARCHETYPE: command
import { cookies } from 'next/headers';
import { supabaseServer } from '@/shared/lib/supabase/server';
import { SupabaseMembershipReader } from '@/features/identity/trainer-self/infrastructure/supabase-membership.reader';
import { SupabaseTrainerSelfRepository } from '@/features/identity/trainer-self/infrastructure/supabase-trainer-self.repository';
import { GetMyProfileQuery } from '@/features/identity/trainer-self/application/queries/get-my-profile';
import { ProfileForm } from '@/features/identity/trainer-self/ui/profile-form';
import { GraduationCap } from 'lucide-react';

export default async function ProfilPage() {
  const supabase = supabaseServer();
  const memberships = await new SupabaseMembershipReader(supabase).list();
  const focus = cookies().get('of_focus')?.value ?? 'all';

  const active = focus === 'all'
    ? (memberships[0] ?? null)
    : (memberships.find(m => m.organizationId === focus) ?? memberships[0] ?? null);

  if (!active) return null; // layout aurait dû rediriger

  const repo = new SupabaseTrainerSelfRepository(supabase);
  const profile = await new GetMyProfileQuery(repo).execute(active.trainerId);

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <header className="flex items-center gap-3 mb-6">
        <span className="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-100 to-rose-100 dark:from-orange-950/50 dark:to-rose-950/30 text-orange-700 dark:text-orange-300 flex items-center justify-center shadow-sm">
          <GraduationCap className="w-5 h-5" />
        </span>
        <div>
          <h1 className="text-[20px] font-semibold text-zinc-900 dark:text-zinc-100">Mon profil</h1>
          <p className="text-[12px] text-zinc-500 dark:text-zinc-400">
            Vous éditez votre profil chez <strong>{active.organizationName}</strong>
            {memberships.length > 1 && ' — cochez "Appliquer à tous" pour synchroniser'}
          </p>
        </div>
      </header>

      <ProfileForm
        memberships={memberships}
        activeTrainerIds={[active.trainerId]}
        initial={{
          firstName: profile.firstName,
          lastName: profile.lastName,
          phone: profile.phone,
          bio: profile.bio,
          specialties: profile.specialties,
          email: profile.email,
          isInternal: profile.isInternal,
        }}
      />
    </div>
  );
}
```

- [ ] **Step 4: typecheck + lint + dev visuel**

Run: `pnpm typecheck && pnpm lint && pnpm dev`
Aller sur `/formateur/profil`, modifier bio, enregistrer, voir le toast "Enregistré ✓".

- [ ] **Step 5: Commit + push**

```bash
git add apps/web/features/identity/trainer-self/ui/profile-form.tsx "apps/web/app/(formateur)/profil/"
git commit -m "feat(formateur): page profil + form RHF/Zod + Server Action updateProfile (batch multi-OF)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>" -- apps/web/features/identity/trainer-self/ui/profile-form.tsx "apps/web/app/(formateur)/profil"
git push origin main
```

---

## Task 13: Page CV + actions (list/add/remove/duplicate)

**Files:**
- Create: `apps/web/features/identity/trainer-self/ui/competency-list.tsx`
- Create: `apps/web/features/identity/trainer-self/ui/competency-row.tsx`
- Create: `apps/web/features/identity/trainer-self/ui/competency-upload-dialog.tsx`
- Create: `apps/web/app/(formateur)/cv/page.tsx`
- Create: `apps/web/app/(formateur)/cv/actions.ts`

- [ ] **Step 1: Server Actions**

> **Note** : l'**ajout** de compétence (avec upload de fichier) passe par la Route Handler `/cv/api/upload/route.ts` (Step 2), pas par une Server Action, car `next-safe-action` gère mal les `File`. Seuls **remove** et **duplicate** passent par `authActionClient`.

```ts
// apps/web/app/(formateur)/cv/actions.ts
'use server';

import { revalidatePath } from 'next/cache';
import { authActionClient } from '@/shared/lib/safe-action';
import { RemoveCompetencySchema, DuplicateCompetencySchema } from '@/features/identity/trainer-self/ui/schemas';
import { SupabaseTrainerCompetencyRepository } from '@/features/identity/trainer-self/infrastructure/supabase-trainer-competency.repository';
import { SupabaseCompetencyStorage } from '@/features/identity/trainer-self/infrastructure/supabase-competency.storage';
import { SupabaseMembershipReader } from '@/features/identity/trainer-self/infrastructure/supabase-membership.reader';
import { RemoveCompetency } from '@/features/identity/trainer-self/application/commands/remove-competency';
import { DuplicateCompetencyToOrgs } from '@/features/identity/trainer-self/application/commands/duplicate-competency-to-orgs';
import { CompetencyId, OrganizationId } from '@/features/dossier/domain/ids';

export const removeCompetencyAction = authActionClient
  .metadata({ name: 'removeCompetencyAction' })
  .schema(RemoveCompetencySchema)
  .action(async ({ parsedInput, ctx }) => {
    const repo = new SupabaseTrainerCompetencyRepository(ctx.supabase);
    const storage = new SupabaseCompetencyStorage(ctx.supabase);
    await new RemoveCompetency(repo, storage).execute(CompetencyId(parsedInput.competencyId));
    revalidatePath('/cv');
    return { ok: true };
  });

export const duplicateCompetencyAction = authActionClient
  .metadata({ name: 'duplicateCompetencyAction' })
  .schema(DuplicateCompetencySchema)
  .action(async ({ parsedInput, ctx }) => {
    const repo = new SupabaseTrainerCompetencyRepository(ctx.supabase);
    const memberships = new SupabaseMembershipReader(ctx.supabase);
    const ids = await new DuplicateCompetencyToOrgs(repo, memberships).execute({
      sourceCompetencyId: CompetencyId(parsedInput.sourceCompetencyId),
      targetOrganizationIds: parsedInput.targetOrganizationIds.map(OrganizationId),
    });
    revalidatePath('/cv');
    return { ok: true, createdIds: ids };
  });

// Upload séparé : la FormData passe par une Route Handler dédiée /api/cv/upload
// (next-safe-action ne gère pas File élégamment). Voir Task 13 Step 4.
```

- [ ] **Step 2: Route Handler upload**

```ts
// apps/web/app/(formateur)/cv/api/upload/route.ts
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { supabaseServer } from '@/shared/lib/supabase/server';
import { SupabaseTrainerCompetencyRepository } from '@/features/identity/trainer-self/infrastructure/supabase-trainer-competency.repository';
import { SupabaseCompetencyStorage } from '@/features/identity/trainer-self/infrastructure/supabase-competency.storage';
import { AddCompetency } from '@/features/identity/trainer-self/application/commands/add-competency';
import { CompetencyKindSchema } from '@/features/identity/trainer-self/ui/schemas';
import { OrganizationId, TrainerId } from '@/features/dossier/domain/ids';

const Meta = z.object({
  trainerId: z.string().uuid(),
  organizationId: z.string().uuid(),
  kind: CompetencyKindSchema,
  title: z.string().min(1).max(200),
  issuer: z.string().max(200).optional(),
  obtainedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  expiresAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

const ALLOWED = ['application/pdf', 'image/jpeg', 'image/png'] as const;
const MAX = 10 * 1024 * 1024;

export async function POST(req: Request) {
  const supabase = supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: 'unauthenticated' }, { status: 401 });

  const fd = await req.formData();
  const metaRaw = fd.get('meta');
  if (typeof metaRaw !== 'string') return NextResponse.json({ ok: false, error: 'missing_meta' }, { status: 400 });

  const meta = Meta.safeParse(JSON.parse(metaRaw));
  if (!meta.success) return NextResponse.json({ ok: false, error: 'invalid_meta', details: meta.error.flatten() }, { status: 400 });

  const file = fd.get('file');
  if (file && !(file instanceof File)) return NextResponse.json({ ok: false, error: 'invalid_file' }, { status: 400 });
  if (file && file.size > MAX) return NextResponse.json({ ok: false, error: 'file_too_large' }, { status: 400 });
  if (file && !ALLOWED.includes(file.type as any)) return NextResponse.json({ ok: false, error: 'invalid_file_type' }, { status: 400 });

  const cmd = new AddCompetency(
    new SupabaseTrainerCompetencyRepository(supabase),
    new SupabaseCompetencyStorage(supabase),
  );

  try {
    const id = await cmd.execute({
      trainerId: TrainerId(meta.data.trainerId),
      organizationId: OrganizationId(meta.data.organizationId),
      kind: meta.data.kind,
      title: meta.data.title,
      issuer: meta.data.issuer ?? null,
      obtainedAt: meta.data.obtainedAt ? new Date(meta.data.obtainedAt) : null,
      expiresAt: meta.data.expiresAt ? new Date(meta.data.expiresAt) : null,
      file: file ? {
        name: file.name,
        body: await file.arrayBuffer(),
        contentType: file.type,
      } : undefined,
    });
    return NextResponse.json({ ok: true, id });
  } catch (e) {
    console.error('[cv/upload]', e);
    return NextResponse.json({ ok: false, error: 'upload_failed' }, { status: 500 });
  }
}
```

- [ ] **Step 3: Composants UI (list + row + upload dialog)**

`competency-list.tsx` (Server Component) :

```tsx
// apps/web/features/identity/trainer-self/ui/competency-list.tsx
import 'server-only';
import type { TrainerCompetency } from '../domain/trainer-competency';
import { CompetencyRow } from './competency-row';
import type { TrainerMembership } from '../application/ports';

const KIND_LABELS = {
  diploma: 'Diplômes',
  certification: 'Certifications',
  experience: 'Expériences',
  cv: 'CV',
} as const;

export function CompetencyList({
  competencies,
  memberships,
  activeTrainerId,
}: {
  competencies: TrainerCompetency[];
  memberships: TrainerMembership[];
  activeTrainerId: string;
}) {
  const grouped: Record<string, TrainerCompetency[]> = { diploma: [], certification: [], experience: [], cv: [] };
  for (const c of competencies) grouped[c.kind]!.push(c);

  return (
    <div className="space-y-6">
      {(['diploma', 'certification', 'experience', 'cv'] as const).map(kind => (
        <section key={kind}>
          <h2 className="text-[13px] font-medium text-zinc-700 dark:text-zinc-300 mb-2 uppercase tracking-wide">
            {KIND_LABELS[kind]} <span className="text-zinc-400">· {grouped[kind].length}</span>
          </h2>
          <div className="space-y-1.5">
            {grouped[kind].length === 0 && (
              <p className="text-[12px] text-zinc-400 italic py-2">Aucun élément</p>
            )}
            {grouped[kind].map(c => (
              <CompetencyRow key={c.id} competency={c} memberships={memberships} activeTrainerId={activeTrainerId} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
```

`competency-row.tsx` (Client) :

```tsx
// apps/web/features/identity/trainer-self/ui/competency-row.tsx
'use client';

import { useState } from 'react';
import { useAction } from 'next-safe-action/hooks';
import { Trash2, Copy, FileText, MoreHorizontal } from 'lucide-react';
import type { TrainerCompetency } from '../domain/trainer-competency';
import type { TrainerMembership } from '../application/ports';
import { removeCompetencyAction, duplicateCompetencyAction } from '@/app/(formateur)/cv/actions';

const STATUS_STYLES = {
  valid: 'bg-zinc-100 dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400',
  expiring_soon: 'bg-purple-200 dark:bg-purple-950/50 text-purple-800 dark:text-purple-300',
  expired: 'bg-red-200 dark:bg-red-950/50 text-red-800 dark:text-red-300',
  no_expiry: 'bg-zinc-50 dark:bg-zinc-950 text-zinc-500 dark:text-zinc-500',
} as const;

const STATUS_LABELS = {
  valid: 'Valide', expiring_soon: 'Expire bientôt', expired: 'Expirée', no_expiry: '—',
} as const;

export function CompetencyRow({
  competency,
  memberships,
  activeTrainerId,
}: {
  competency: TrainerCompetency;
  memberships: TrainerMembership[];
  activeTrainerId: string;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const remove = useAction(removeCompetencyAction);
  const dup = useAction(duplicateCompetencyAction);

  const otherOrgs = memberships.filter(m => m.trainerId !== activeTrainerId);

  return (
    <div className="flex items-start justify-between gap-3 p-3 rounded-lg border border-zinc-200/60 dark:border-zinc-800 bg-white dark:bg-zinc-950 hover:shadow-sm transition">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          {competency.documentPath && <FileText className="w-3.5 h-3.5 text-zinc-400 shrink-0" />}
          <h3 className="text-[13px] font-medium text-zinc-900 dark:text-zinc-100 truncate">{competency.title}</h3>
          <span className={`text-[10px] px-1.5 py-0.5 rounded ${STATUS_STYLES[competency.status]}`}>
            {STATUS_LABELS[competency.status]}
          </span>
        </div>
        <div className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5 truncate">
          {competency.issuer && <>{competency.issuer} · </>}
          {competency.obtainedAt && competency.obtainedAt.toISOString().slice(0, 10)}
          {competency.expiresAt && <> → {competency.expiresAt.toISOString().slice(0, 10)}</>}
        </div>
      </div>

      <div className="relative shrink-0">
        <button onClick={() => setMenuOpen(!menuOpen)} className="p-1.5 rounded hover:bg-zinc-100 dark:hover:bg-zinc-900">
          <MoreHorizontal className="w-3.5 h-3.5 text-zinc-500" />
        </button>
        {menuOpen && (
          <div className="absolute right-0 top-full mt-1 min-w-[200px] bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg shadow-md z-10">
            {otherOrgs.length > 0 && (
              <button
                onClick={() => { dup.execute({ sourceCompetencyId: competency.id, targetOrganizationIds: otherOrgs.map(o => o.organizationId) }); setMenuOpen(false); }}
                className="w-full text-left px-3 py-2 text-[12px] hover:bg-zinc-50 dark:hover:bg-zinc-900 inline-flex items-center gap-2"
              >
                <Copy className="w-3 h-3" /> Dupliquer vers mes autres OF
              </button>
            )}
            <button
              onClick={() => { if (confirm('Supprimer cette compétence ?')) { remove.execute({ competencyId: competency.id }); } setMenuOpen(false); }}
              className="w-full text-left px-3 py-2 text-[12px] text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 inline-flex items-center gap-2"
            >
              <Trash2 className="w-3 h-3" /> Supprimer
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
```

`competency-upload-dialog.tsx` (Client) :

```tsx
// apps/web/features/identity/trainer-self/ui/competency-upload-dialog.tsx
'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useRouter } from 'next/navigation';
import { Plus, X, Upload, Loader2 } from 'lucide-react';
import { FormField, inputClass } from '@/shared/ui/form-field';

type Form = {
  kind: 'diploma' | 'certification' | 'experience' | 'cv';
  title: string;
  issuer?: string;
  obtainedAt?: string;
  expiresAt?: string;
};

const ALLOWED = ['application/pdf', 'image/jpeg', 'image/png'];

export function CompetencyUploadDialog({
  trainerId,
  organizationId,
}: {
  trainerId: string;
  organizationId: string;
}) {
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const router = useRouter();
  const { register, handleSubmit, reset } = useForm<Form>({ defaultValues: { kind: 'diploma' } });

  const onSubmit = async (data: Form) => {
    setSubmitting(true); setError(null);
    const fd = new FormData();
    fd.append('meta', JSON.stringify({ ...data, trainerId, organizationId }));
    if (file) fd.append('file', file);

    const res = await fetch('/cv/api/upload', { method: 'POST', body: fd });
    const body = await res.json();
    setSubmitting(false);

    if (!body.ok) { setError(body.error || 'Échec'); return; }
    setOpen(false); reset(); setFile(null);
    router.refresh();
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-orange-500 text-white text-[12px] font-medium hover:bg-orange-600 shadow-sm transition"
      >
        <Plus className="w-3.5 h-3.5" /> Ajouter
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setOpen(false)}>
          <form
            onSubmit={handleSubmit(onSubmit)}
            onClick={e => e.stopPropagation()}
            className="bg-white dark:bg-zinc-950 rounded-2xl shadow-lg max-w-md w-full p-5 space-y-4 border border-zinc-200 dark:border-zinc-800"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-[16px] font-medium">Nouvelle compétence</h2>
              <button type="button" onClick={() => setOpen(false)} className="p-1 hover:bg-zinc-100 dark:hover:bg-zinc-900 rounded">
                <X className="w-4 h-4" />
              </button>
            </div>

            <FormField label="Type" required>
              <select className={inputClass} {...register('kind', { required: true })}>
                <option value="diploma">Diplôme</option>
                <option value="certification">Certification</option>
                <option value="experience">Expérience</option>
                <option value="cv">CV</option>
              </select>
            </FormField>

            <FormField label="Titre" required>
              <input className={inputClass} {...register('title', { required: true, maxLength: 200 })} />
            </FormField>

            <FormField label="Émetteur">
              <input className={inputClass} {...register('issuer', { maxLength: 200 })} />
            </FormField>

            <div className="grid grid-cols-2 gap-3">
              <FormField label="Obtenu le">
                <input type="date" className={inputClass} {...register('obtainedAt')} />
              </FormField>
              <FormField label="Expire le">
                <input type="date" className={inputClass} {...register('expiresAt')} />
              </FormField>
            </div>

            <FormField label="Document (PDF/JPG/PNG, max 10 Mo)">
              <input
                type="file"
                accept={ALLOWED.join(',')}
                onChange={e => setFile(e.target.files?.[0] ?? null)}
                className="text-[12px] file:mr-2 file:px-2 file:py-1 file:rounded file:border file:bg-zinc-50 dark:file:bg-zinc-900 file:border-zinc-200 dark:file:border-zinc-800"
              />
            </FormField>

            {error && <p className="text-[12px] text-red-600 dark:text-red-400">{error}</p>}

            <div className="flex items-center gap-2 pt-2">
              <button
                type="submit"
                disabled={submitting}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-orange-500 text-white text-[13px] font-medium hover:bg-orange-600 disabled:opacity-50 shadow-sm"
              >
                {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                Ajouter
              </button>
              <button type="button" onClick={() => setOpen(false)} className="px-3 py-2 text-[13px] text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-900 rounded-lg">
                Annuler
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
```

- [ ] **Step 4: Page CV**

```tsx
// apps/web/app/(formateur)/cv/page.tsx
// ARCHETYPE: command
import { cookies } from 'next/headers';
import { supabaseServer } from '@/shared/lib/supabase/server';
import { SupabaseMembershipReader } from '@/features/identity/trainer-self/infrastructure/supabase-membership.reader';
import { SupabaseTrainerCompetencyRepository } from '@/features/identity/trainer-self/infrastructure/supabase-trainer-competency.repository';
import { ListMyCompetenciesQuery } from '@/features/identity/trainer-self/application/queries/list-my-competencies';
import { CompetencyList } from '@/features/identity/trainer-self/ui/competency-list';
import { CompetencyUploadDialog } from '@/features/identity/trainer-self/ui/competency-upload-dialog';
import { FileText } from 'lucide-react';

export default async function CvPage() {
  const supabase = supabaseServer();
  const memberships = await new SupabaseMembershipReader(supabase).list();
  const focus = cookies().get('of_focus')?.value ?? 'all';
  const active = focus === 'all'
    ? memberships[0]!
    : memberships.find(m => m.organizationId === focus) ?? memberships[0]!;

  const repo = new SupabaseTrainerCompetencyRepository(supabase);
  const competencies = await new ListMyCompetenciesQuery(repo).execute(active.trainerId);

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <header className="flex items-center justify-between gap-3 mb-6">
        <div className="flex items-center gap-3">
          <span className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-100 to-blue-100 dark:from-purple-950/50 dark:to-blue-950/30 text-purple-700 dark:text-purple-300 flex items-center justify-center shadow-sm">
            <FileText className="w-5 h-5" />
          </span>
          <div>
            <h1 className="text-[20px] font-semibold text-zinc-900 dark:text-zinc-100">Mes compétences</h1>
            <p className="text-[12px] text-zinc-500 dark:text-zinc-400">
              Chez <strong>{active.organizationName}</strong>{memberships.length > 1 && ' · changer d\'OF dans le header'}
            </p>
          </div>
        </div>
        <CompetencyUploadDialog trainerId={active.trainerId} organizationId={active.organizationId} />
      </header>

      <CompetencyList competencies={competencies} memberships={memberships} activeTrainerId={active.trainerId} />
    </div>
  );
}
```

- [ ] **Step 5: typecheck + lint + dev visuel**

Run: `pnpm typecheck && pnpm lint && pnpm dev`
Sur `/formateur/cv` : ajouter, supprimer, dupliquer une compétence (visuellement + DB).

- [ ] **Step 6: Commit + push**

```bash
git add apps/web/features/identity/trainer-self/ui/competency-list.tsx apps/web/features/identity/trainer-self/ui/competency-row.tsx apps/web/features/identity/trainer-self/ui/competency-upload-dialog.tsx "apps/web/app/(formateur)/cv/"
git commit -m "feat(formateur): page CV (list + add via upload + remove + dupliquer vers autres OFs)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>" -- apps/web/features/identity/trainer-self/ui/competency-list.tsx apps/web/features/identity/trainer-self/ui/competency-row.tsx apps/web/features/identity/trainer-self/ui/competency-upload-dialog.tsx "apps/web/app/(formateur)/cv"
git push origin main
```

---

## Task 14: Câblage invitation OF — création trainer + magic link

**Files:**
- Create: `apps/web/app/(dashboard)/formateurs/nouveau/actions.ts`
- Modify: `apps/web/app/(dashboard)/formateurs/nouveau/page.tsx` (Form → Server Action)

> Cette tâche câble la page **admin OF** existante (qui est actuellement un mock pur) pour qu'elle INSERT réellement dans `app.trainers` et envoie un magic link via `supabase.auth.admin.inviteUserByEmail`. Le trigger autolink de la migration 0028 fera le reste si le user existe déjà. Sinon, l'utilisateur signup via le magic link, atterrit sur `/formateur`, et le `link_my_trainer_rows` du layout convertit son user_id.

- [ ] **Step 1: Server Action (admin OF — utilise service_role pour `inviteUserByEmail`)**

```ts
// apps/web/app/(dashboard)/formateurs/nouveau/actions.ts
'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { createClient } from '@supabase/supabase-js';
import { redirect } from 'next/navigation';
import { env } from '@/env.mjs';
import { supabaseServer } from '@/shared/lib/supabase/server';

const Schema = z.object({
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
  email: z.string().email().max(255),
  phone: z.string().trim().max(30).optional().or(z.literal('')),
  isInternal: z.boolean(),
  siret: z.string().regex(/^\d{14}$/).optional().or(z.literal('')),
  specialties: z.array(z.string()).max(12).optional(),
});

export type CreateTrainerResult =
  | { ok: true; trainerId: string; invited: boolean }
  | { ok: false; error: string; details?: unknown };

export async function createTrainer(formData: FormData): Promise<CreateTrainerResult> {
  const supabase = supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'unauthenticated' };

  // Récup organization_id du user via une RPC ou via member_id JWT claim — TODO : adapter au pattern OF du repo.
  // Hypothèse : il existe une RPC `app.current_organization_id()` (sinon, à câbler côté identity).
  const { data: orgRow, error: orgErr } = await supabase.rpc('current_organization_id' as any);
  if (orgErr || !orgRow) return { ok: false, error: 'no_active_organization' };

  const payload = Object.fromEntries(formData.entries()) as Record<string, string>;
  const parsed = Schema.safeParse({
    firstName: payload.firstName,
    lastName: payload.lastName,
    email: payload.email?.toLowerCase().trim(),
    phone: payload.phone || undefined,
    isInternal: payload.isInternal === 'true' || payload.isInternal === 'on',
    siret: payload.siret || undefined,
    specialties: payload.specialties ? JSON.parse(payload.specialties) : undefined,
  });
  if (!parsed.success) return { ok: false, error: 'invalid_input', details: parsed.error.flatten() };

  // INSERT via session user (RLS admin policies déjà en place sur trainers)
  const { data: trainer, error: insertErr } = await supabase
    .schema('app').from('trainers').insert({
      organization_id: orgRow,
      first_name: parsed.data.firstName,
      last_name: parsed.data.lastName,
      email: parsed.data.email,
      phone: parsed.data.phone ?? null,
      is_internal: parsed.data.isInternal,
      siret: parsed.data.siret ?? null,
      specialties: parsed.data.specialties ?? [],
    }).select('id, user_id').single();
  if (insertErr || !trainer) return { ok: false, error: 'db_insert_failed', details: insertErr?.message };

  // Si user_id NULL après trigger autolink → user n'existe pas → invite magic link
  let invited = false;
  if (!trainer.user_id) {
    const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });
    const redirectTo = `${env.PUBLIC_APP_URL?.replace(/\/$/, '')}/formateur`;
    const { error: inviteErr } = await admin.auth.admin.inviteUserByEmail(parsed.data.email, { redirectTo });
    if (inviteErr) {
      console.error('[createTrainer] invite failed', inviteErr);
      // On garde la fiche, l'admin pourra renvoyer l'invite plus tard
    } else {
      invited = true;
    }
  }

  revalidatePath('/formateurs');
  return { ok: true, trainerId: trainer.id, invited };
}
```

> ⚠️ **Dépendance** : la RPC `current_organization_id()` est supposée existante (pattern multi-tenant existant — vérifier `supabase/migrations/0018_rls_helpers.sql`). Si pas dispo, à câbler en pré-requis (ou récupérer via `auth.users.raw_app_meta_data.organization_id` selon convention du projet).

- [ ] **Step 2: Convertir la page Mock en form Client câblé à la Server Action**

Remplacer le contenu de `apps/web/app/(dashboard)/formateurs/nouveau/page.tsx` par :

```tsx
// apps/web/app/(dashboard)/formateurs/nouveau/page.tsx
// ARCHETYPE: workflow
'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Check, UserCog, Loader2 } from 'lucide-react';
import { FormField, inputClass } from '@/shared/ui/form-field';
import { createTrainer, type CreateTrainerResult } from './actions';

export default function NouveauFormateurPage() {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<CreateTrainerResult | null>(null);
  const [specialtiesRaw, setSpecialtiesRaw] = useState('');
  const router = useRouter();

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const specialties = specialtiesRaw
      .split(',').map(s => s.trim()).filter(Boolean).slice(0, 12);
    fd.set('specialties', JSON.stringify(specialties));

    startTransition(async () => {
      const res = await createTrainer(fd);
      setResult(res);
      if (res.ok) setTimeout(() => router.push('/formateurs'), 1500);
    });
  };

  return (
    <div className="min-h-[calc(100vh-4rem)]">
      <div className="max-w-2xl w-full mx-auto px-8 py-10">
        <Link
          href="/formateurs"
          className="text-[13px] text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 inline-flex items-center gap-1.5 transition mb-6"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Retour aux formateurs
        </Link>

        <header className="mb-8 flex items-center gap-3">
          <span className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-100 to-emerald-50 dark:from-emerald-950/60 dark:to-emerald-950/30 text-emerald-700 dark:text-emerald-300 flex items-center justify-center shadow-sm">
            <UserCog className="w-5 h-5" />
          </span>
          <div>
            <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100 tracking-tight">
              Nouveau formateur
            </h1>
            <p className="text-[13px] text-zinc-500 dark:text-zinc-400 mt-0.5">
              Ajoutez un formateur (interne ou externe) à votre réseau.
            </p>
          </div>
        </header>

        <form onSubmit={onSubmit} className="space-y-5">
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Prénom" required>
              <input name="firstName" className={inputClass} required maxLength={100} />
            </FormField>
            <FormField label="Nom" required>
              <input name="lastName" className={inputClass} required maxLength={100} />
            </FormField>
          </div>

          <FormField label="Email" required hint="Un magic link sera envoyé si l'adresse n'a pas encore de compte">
            <input name="email" type="email" className={inputClass} required maxLength={255} />
          </FormField>

          <FormField label="Téléphone">
            <input name="phone" className={inputClass} maxLength={30} />
          </FormField>

          <FormField label="Type">
            <label className="inline-flex items-center gap-2 text-[13px] mr-4">
              <input type="radio" name="isInternal" value="true" defaultChecked /> Interne
            </label>
            <label className="inline-flex items-center gap-2 text-[13px]">
              <input type="radio" name="isInternal" value="false" /> Externe (freelance)
            </label>
          </FormField>

          <FormField label="SIRET" hint="14 chiffres — si formateur externe">
            <input name="siret" className={inputClass} pattern="\d{14}" maxLength={14} />
          </FormField>

          <FormField label="Spécialités" hint="Séparées par virgule, max 12">
            <input
              className={inputClass}
              value={specialtiesRaw}
              onChange={e => setSpecialtiesRaw(e.target.value)}
              placeholder="qualiopi, anglais, vente"
            />
          </FormField>

          <div className="flex items-center gap-3 pt-2">
            <button
              type="submit"
              disabled={pending}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-orange-500 text-white text-[13px] font-medium hover:bg-orange-600 disabled:opacity-50 shadow-sm transition"
            >
              {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              Créer le formateur
            </button>
            {result?.ok && (
              <span className="text-[12px] text-emerald-600 dark:text-emerald-400">
                {result.invited
                  ? '✓ Fiche créée, invitation envoyée'
                  : '✓ Fiche créée (utilisateur déjà membre)'}
              </span>
            )}
            {result && !result.ok && (
              <span className="text-[12px] text-red-600 dark:text-red-400">Erreur : {result.error}</span>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Test manuel**

Run: `pnpm dev`
Aller sur `/formateurs/nouveau`, créer un formateur avec un email **inexistant** dans `auth.users` → vérifier qu'un magic link arrive (Resend ou logs supabase local) → cliquer → atterrir sur `/formateur` après signup, voir la fiche link.

- [ ] **Step 4: Commit + push**

```bash
git add "apps/web/app/(dashboard)/formateurs/nouveau/actions.ts" "apps/web/app/(dashboard)/formateurs/nouveau/page.tsx"
git commit -m "feat(formateurs): câble création + magic link invitation (page existait en mock)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>" -- "apps/web/app/(dashboard)/formateurs/nouveau"
git push origin main
```

---

## Task 15: E2E Playwright — golden path multi-OF

**Files:**
- Create: `apps/web/tests/e2e/trainer-self.spec.ts`

- [ ] **Step 1: Écrire le test E2E**

```ts
// apps/web/tests/e2e/trainer-self.spec.ts
import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

test.describe('Espace formateur — Foundation', () => {
  const email = `e2e-${Date.now()}@example.com`;
  let userId: string;
  let org1Id: string;
  let org2Id: string;
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

  test.beforeAll(async () => {
    // 1) Seed 2 OFs
    org1Id = randomUUID();
    org2Id = randomUUID();
    await admin.schema('app').from('organizations').insert([
      { id: org1Id, name: 'E2E OF Alpha', slug: `alpha-${Date.now()}` },
      { id: org2Id, name: 'E2E OF Beta',  slug: `beta-${Date.now()}` },
    ]);

    // 2) Seed 2 fiches trainers (sans user_id, doit autolink après signup)
    await admin.schema('app').from('trainers').insert([
      { organization_id: org1Id, first_name: 'E2E', last_name: 'User', email, is_internal: false },
      { organization_id: org2Id, first_name: 'E2E', last_name: 'User', email, is_internal: false },
    ]);

    // 3) Créer le user via admin
    const { data, error } = await admin.auth.admin.createUser({
      email, password: 'E2E-Pass-1234!', email_confirm: true,
    });
    if (error) throw error;
    userId = data.user!.id;
  });

  test.afterAll(async () => {
    await admin.auth.admin.deleteUser(userId);
    await admin.schema('app').from('organizations').delete().in('id', [org1Id, org2Id]);
  });

  test('golden path multi-OF', async ({ page }) => {
    // Login
    await page.goto('/auth/login');
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Mot de passe').fill('E2E-Pass-1234!');
    await page.getByRole('button', { name: /se connecter/i }).click();

    // Dashboard formateur s'affiche
    await page.goto('/formateur');
    await expect(page.getByText(/Bonjour E2E/)).toBeVisible();
    await expect(page.getByText(/2 organismes/)).toBeVisible();

    // OfSwitcher montre 2 OFs
    await page.getByRole('button', { name: /Tous mes OF|E2E OF/ }).click();
    await expect(page.getByText('E2E OF Alpha')).toBeVisible();
    await expect(page.getByText('E2E OF Beta')).toBeVisible();

    // Aller sur Profil et modifier bio
    await page.goto('/formateur/profil');
    await page.getByLabel('Bio').fill('Bio E2E auto-test');
    await page.getByRole('button', { name: /enregistrer/i }).click();
    await expect(page.getByText(/Enregistré/)).toBeVisible();

    // Aller sur CV et ajouter une compétence
    await page.goto('/formateur/cv');
    await page.getByRole('button', { name: /ajouter/i }).click();
    await page.getByLabel('Titre').fill('Master MEEF — E2E');
    await page.getByRole('button', { name: /^ajouter$/i }).last().click();
    await expect(page.getByText('Master MEEF — E2E')).toBeVisible();

    // Dupliquer vers autre OF
    await page.getByRole('button').filter({ hasText: /^$/ }).filter({ has: page.locator('svg') }).first().click();
    // (le bouton MoreHorizontal n'a pas de texte — sélecteur fragile, à raffiner)
    await page.getByText(/Dupliquer vers mes autres OF/).click();

    // Vérifier que la compétence existe maintenant dans les 2 OFs (via service_role)
    const { data: comps } = await admin.schema('app').from('trainer_competencies')
      .select('id, trainer_id, title').eq('title', 'Master MEEF — E2E');
    expect(comps).toHaveLength(2);
  });
});
```

> ⚠️ Le sélecteur du bouton MoreHorizontal (Step 1 ligne "page.getByRole..filter...") est fragile. À raffiner avec un `data-testid="competency-menu-button"` ajouté sur `<button>` dans `competency-row.tsx`.

- [ ] **Step 2: Ajouter le `data-testid` sur le bouton menu**

Edit `apps/web/features/identity/trainer-self/ui/competency-row.tsx` — ligne du bouton MoreHorizontal :

```tsx
<button data-testid="competency-menu-button" onClick={() => setMenuOpen(!menuOpen)} ...>
```

Et raffiner le sélecteur E2E :

```ts
await page.locator('[data-testid="competency-menu-button"]').first().click();
```

- [ ] **Step 3: Lancer le test E2E**

Run: `pnpm test:e2e --grep "golden path multi-OF"`
Expected: PASS.

- [ ] **Step 4: Commit + push**

```bash
git add apps/web/tests/e2e/trainer-self.spec.ts apps/web/features/identity/trainer-self/ui/competency-row.tsx
git commit -m "test(e2e): golden path espace formateur multi-OF (signup → profil → CV → dup)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>" -- apps/web/tests/e2e/trainer-self.spec.ts apps/web/features/identity/trainer-self/ui/competency-row.tsx
git push origin main
```

---

## Self-Review checklist (à exécuter avant de marquer Foundation comme done)

- [ ] **§1 Spec coverage** — chaque item de la spec a une task qui l'implémente :
  - Multi-membership identité → Tasks 1, 2 (DB), 9 (infra)
  - Shell `app/(formateur)/*` → Task 10 (layout + header + switcher)
  - Page profil → Task 12
  - Page CV → Task 13
  - Onboarding magic link → Task 14
  - RLS self → Task 2
  - RPC `list_my_trainer_memberships` → Task 1
- [ ] **§2 Décisions structurantes** — toutes implémentées :
  - Multi-OF + multi-entreprises ✓ (Tasks 1, 9, 10)
  - Vue agrégée + cookie `of_focus` ✓ (Task 10)
  - Linkage première visite ✓ (Task 10 layout)
  - Compétences statu quo (a) + duplication ✓ (Task 13)
  - Permissions self-edit (trigger) ✓ (Task 1)
  - DDD light avec `trainer-self/` ✓ (Tasks 5–9)
- [ ] **§4.4 Tests pgTAP** — au moins les 8 assertions clés sont couvertes (Tasks 1 + 2)
- [ ] **§9 Tests** :
  - Domain unit ✓ (Tasks 5, 6)
  - Application unit ✓ (Task 8)
  - E2E Playwright ✓ (Task 15)
- [ ] **§10 Non-objectifs** — rien de ces items n'a fui dans le code (planning/Zoom/NDA/supports = renvoyés au sous-projet 2 et 3)

---

## Risques & contournements

| Risque | Plan B |
|---|---|
| RPC `current_organization_id()` n'existe pas (Task 14) | La récupérer côté Server Action via une requête sur `app.organization_members WHERE user_id = auth.uid()` |
| Tailwind safelist non appliquée (couleurs OfSwitcher) | Hardcoder une map `{[orgId]: 'orange' | 'rose' | …}` avec classes complètes |
| `supabase.auth.admin.inviteUserByEmail` rate-limit en local | Continuer sans erreur (la fiche existe, le formateur peut signup classique avec son email) |
| `pnpm db:test` ne trouve pas pgTAP en local | `supabase functions deploy` ou `CREATE EXTENSION pgtap;` manuel via psql |
| Tests E2E flaky sur le menu MoreHorizontal | Sélecteur data-testid (déjà inclus Task 15 Step 2) |

---

## Récap commits attendus (chronologique)

1. `fix(migrations): renomme seed_default_org en 0027 pour libérer 0026` (pré-requis)
2. `feat(db): multi-membership formateur` (Task 1)
3. `feat(db): RLS self-access formateur multi-OF` (Task 2)
4. `feat(db): buckets avatars + trainer-cvs` (Task 3)
5. `feat(safe-action): authActionClient + CompetencyId` (Task 4)
6. `feat(trainer-self/domain): TrainerProfile entity` (Task 5)
7. `feat(trainer-self/domain): TrainerCompetency entity` (Task 6)
8. `feat(trainer-self/application): ports + queries` (Task 7)
9. `feat(trainer-self/application): commands` (Task 8)
10. `feat(trainer-self/infra): repositories + storage` (Task 9)
11. `feat(formateur/ui): shell layout + header + switcher` (Task 10)
12. `feat(formateur): dashboard` (Task 11)
13. `feat(formateur): page profil` (Task 12)
14. `feat(formateur): page CV` (Task 13)
15. `feat(formateurs): câble création + invitation` (Task 14)
16. `test(e2e): golden path formateur multi-OF` (Task 15)

Total : 15 commits + 1 pré-requis = 16 pushes vers `origin/main`, soit autant de déploiements Railway de prévisualisation.
