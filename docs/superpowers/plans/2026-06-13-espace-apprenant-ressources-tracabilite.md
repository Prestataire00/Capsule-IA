# Espace apprenant — Ressources & traçabilité — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Câbler l'espace apprenant existant sur des données réelles (documents `app.documents` + supports pédagogiques par module) et activer un journal d'audit unifié de consultation, exportable pour Qualiopi.

**Architecture :** Deux nouvelles tables (`app.module_resources` rattachée au catalogue, `app.resource_access_log` append-only polymorphe), un bucket Storage `pedagogical`, une RPC `SECURITY DEFINER` lue par l'espace apprenant (pas de session Supabase côté apprenant → JWT vérifié serveur), un helper serveur de journalisation appelé à la consultation/au téléchargement, et deux surfaces gestionnaire (upload supports sur la fiche formation, traçabilité + export CSV sur la fiche dossier).

**Tech Stack :** Next.js 14 App Router (RSC + Server Actions, `next-safe-action`), Supabase (Postgres, RLS, RPC SQL, Storage), TypeScript strict, Vitest (unit), pgTAP (RLS), Playwright (E2E). Spec de référence : [docs/superpowers/specs/2026-06-13-espace-apprenant-ressources-tracabilite-design.md](../specs/2026-06-13-espace-apprenant-ressources-tracabilite-design.md).

> ⚠️ **Numéros de migration :** ce plan utilise `0048`→`0051`. `0047` est le dernier sur `main` au moment de l'écriture, mais des sessions parallèles existent. **Lancer `git fetch origin` puis vérifier `ls supabase/migrations/ | tail -3` AVANT de créer les fichiers** ; renuméroter en conséquence (et idem pour `supabase/tests/`).

> ⚠️ **Vérification DB :** `pnpm db:reset` / `pnpm db:test` exigent Docker + Supabase local. S'ils sont indisponibles, appliquer les migrations en **write-only** et marquer la vérification DB **PENDING** explicitement dans le commit/PR — ne jamais prétendre que les tests pgTAP passent sans les avoir lancés. `pnpm typecheck` n'est pas fiable sur ce repo : valider la compilation via `pnpm --filter web build`.

---

## File Structure

**Migrations (créées) :**
- `supabase/migrations/0048_module_resources.sql` — table supports pédagogiques (catalog) + RLS.
- `supabase/migrations/0049_resource_access_log.sql` — journal d'audit polymorphe + RLS.
- `supabase/migrations/0050_pedagogical_bucket.sql` — bucket Storage privé `pedagogical`.
- `supabase/migrations/0051_apprenant_resources_rpc.sql` — RPC `get_apprenant_resources` + fonction SQL `compute_dossier_assiduite`.

**Tests DB (créés) :**
- `supabase/tests/0048_test_module_resources_rls.sql`
- `supabase/tests/0049_test_resource_access_log_rls.sql`

**Domaine / logique (créés) :**
- `apps/web/features/attendance/assiduite.ts` — fonction pure de calcul d'assiduité.
- `apps/web/features/attendance/assiduite.test.ts` — unit tests Vitest.

**Apprenant — serveur (créés/modifiés) :**
- `apps/web/app/(apprenant)/espace/[token]/resources.ts` — *(créé)* resolver `resolveApprenantResources(token)` (RPC) + helper `logResourceAccess(...)`.
- `apps/web/app/(apprenant)/espace/[token]/documents/page.tsx` — *(modifié)* câblage réel, suppression mocks.
- `apps/web/app/(apprenant)/espace/[token]/page.tsx` — *(modifié)* compteurs réels (assiduité).
- `apps/web/app/(apprenant)/espace/[token]/_lib.ts` — *(modifié)* suppression `MOCK_ADMIN_DOCS` / `MOCK_SUPPORTS_BY_MODULE`.
- `apps/web/app/api/espace/[token]/resource/[id]/route.ts` — *(créé)* route signed-URL + log `download`.
- `apps/web/app/api/dossiers/[id]/convention.pdf/route.ts` — *(modifié)* log `download`.
- `apps/web/app/api/dossiers/[id]/attestation.pdf/route.ts` — *(modifié)* log `download`.

**Gestionnaire (créés) :**
- `apps/web/features/resources/upload-support.schema.ts` — schéma Zod partagé.
- `apps/web/app/(dashboard)/formations/[id]/supports/actions.ts` — Server Actions upload/publish/delete.
- `apps/web/app/(dashboard)/formations/[id]/supports/page.tsx` — UI gestion supports par module.
- `apps/web/app/(dashboard)/dossiers/[id]/tracabilite/page.tsx` — timeline d'accès.
- `apps/web/app/api/dossiers/[id]/tracabilite.csv/route.ts` — export CSV.

**Types (régénéré) :**
- `apps/web/shared/types/database.ts` — via `pnpm db:types` (si Docker dispo).

**E2E (créé) :**
- `apps/web/e2e/espace-ressources.spec.ts`

---

## Task 1: Migration `module_resources`

**Files:**
- Create: `supabase/migrations/0048_module_resources.sql`

- [ ] **Step 1: Vérifier le prochain numéro de migration**

Run: `git fetch origin -q && git log --oneline origin/main -1 && ls supabase/migrations/ | tail -3`
Expected: confirme que `0047` est bien le dernier ; sinon renuméroter ce fichier et les suivants.

- [ ] **Step 2: Écrire la migration**

```sql
-- ============================================================================
-- 0048 — Supports pédagogiques rattachés au module catalogue (contexte catalog)
-- ============================================================================
-- Réutilisables par cohorte : un support uploadé sur un module est disponible
-- pour tous les dossiers qui contiennent ce module (via app.dossier_modules).

CREATE TABLE app.module_resources (
  id               UUID PRIMARY KEY DEFAULT uuidv7(),
  organization_id  UUID NOT NULL REFERENCES app.organizations(id) ON DELETE CASCADE,
  module_id        UUID NOT NULL REFERENCES app.modules(id)        ON DELETE CASCADE,
  title            TEXT NOT NULL CHECK (length(btrim(title)) > 0),
  description      TEXT,
  storage_path     TEXT NOT NULL,
  mime_type        TEXT NOT NULL,
  file_size_bytes  BIGINT CHECK (file_size_bytes IS NULL OR file_size_bytes >= 0),
  file_hash        TEXT,
  position         INT NOT NULL DEFAULT 0 CHECK (position >= 0),
  is_published     BOOLEAN NOT NULL DEFAULT true,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by       UUID REFERENCES auth.users(id),
  deleted_at       TIMESTAMPTZ NULL
);

CREATE INDEX ix_module_resources_org_module
  ON app.module_resources(organization_id, module_id)
  WHERE deleted_at IS NULL;

ALTER TABLE app.module_resources ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.module_resources FORCE ROW LEVEL SECURITY;

-- Membres de l'organisation : lecture
CREATE POLICY module_resources_select ON app.module_resources FOR SELECT
  USING (organization_id IN (SELECT app.current_user_org_ids()));

-- Staff (owner/admin/gestionnaire) : écriture
CREATE POLICY module_resources_insert ON app.module_resources FOR INSERT
  WITH CHECK (organization_id IN (SELECT app.current_user_org_ids()));
CREATE POLICY module_resources_update ON app.module_resources FOR UPDATE
  USING (organization_id IN (SELECT app.current_user_org_ids()))
  WITH CHECK (organization_id IN (SELECT app.current_user_org_ids()));
CREATE POLICY module_resources_delete ON app.module_resources FOR DELETE
  USING (organization_id IN (SELECT app.current_user_org_ids()));
```

> Note : remplacer `app.current_user_org_ids()` par l'helper RLS réellement utilisé dans le repo. **Vérifier** : `grep -rn "current_user_org\|current_org\|auth_org\|app\.user_org" supabase/migrations/0019_rls_identity_crm_catalog.sql` et calquer EXACTEMENT la fonction/forme employée par les policies de `app.modules` dans ce fichier (même pattern de tenancy et de rôle).

- [ ] **Step 3: Appliquer la migration**

Run: `pnpm db:reset`
Expected: migrations rejouées sans erreur jusqu'à `0048`. Si Docker indisponible → **PENDING** (write-only), passer au Task suivant et regrouper la vérif DB plus tard.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0048_module_resources.sql
git commit -m "feat(catalog): table module_resources (supports pédagogiques par module) + RLS"
```

---

## Task 2: Migration `resource_access_log`

**Files:**
- Create: `supabase/migrations/0049_resource_access_log.sql`

- [ ] **Step 1: Écrire la migration**

```sql
-- ============================================================================
-- 0049 — Journal d'audit unifié des accès aux ressources apprenant (append-only)
-- ============================================================================
-- Polymorphe : documents, supports pédagogiques, replays (futur). Référence
-- SOUPLE (pas de FK sur la cible) → la preuve d'accès survit à la suppression.
-- Remplace l'usage de app.document_access_log (0009), laissée dormante.

CREATE TABLE app.resource_access_log (
  id               UUID PRIMARY KEY DEFAULT uuidv7(),
  organization_id  UUID NOT NULL REFERENCES app.organizations(id) ON DELETE CASCADE,
  target_kind      TEXT NOT NULL CHECK (target_kind IN ('document','module_resource','replay')),
  target_id        UUID NOT NULL,
  dossier_id       UUID REFERENCES app.dossiers(id) ON DELETE SET NULL,
  learner_id       UUID REFERENCES app.learners(id) ON DELETE SET NULL,
  actor_kind       TEXT NOT NULL CHECK (actor_kind IN ('learner_token','user','system')),
  action           TEXT NOT NULL CHECK (action IN ('view','download')),
  ip               INET,
  user_agent       TEXT,
  occurred_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ix_resource_access_log_org_dossier
  ON app.resource_access_log(organization_id, dossier_id, occurred_at DESC);
CREATE INDEX ix_resource_access_log_target
  ON app.resource_access_log(target_kind, target_id);

ALTER TABLE app.resource_access_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.resource_access_log FORCE ROW LEVEL SECURITY;

-- Membres de l'organisation : lecture d'audit
CREATE POLICY resource_access_log_select ON app.resource_access_log FOR SELECT
  USING (organization_id IN (SELECT app.current_user_org_ids()));

-- Pas de policy INSERT/UPDATE/DELETE : écriture réservée au service_role
-- (les writers passent par supabaseAdmin() côté serveur, qui bypass RLS).
```

> Même note que Task 1 sur `app.current_user_org_ids()` : aligner sur l'helper réel du repo.

- [ ] **Step 2: Appliquer**

Run: `pnpm db:reset`
Expected: OK jusqu'à `0049` (ou PENDING si Docker down).

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0049_resource_access_log.sql
git commit -m "feat(audit): table resource_access_log append-only (docs/supports/replays)"
```

---

## Task 3: Migration bucket Storage `pedagogical`

**Files:**
- Create: `supabase/migrations/0050_pedagogical_bucket.sql`

- [ ] **Step 1: Écrire la migration** (calquée sur `0038_documents_bucket.sql`)

```sql
-- ============================================================================
-- 0050 — Bucket Storage privé pour les supports pédagogiques par module
-- ============================================================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'pedagogical',
  'pedagogical',
  false,
  52428800, -- 50 MB
  ARRAY[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation', -- pptx
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',          -- xlsx
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',    -- docx
    'image/png',
    'image/jpeg'
  ]
)
ON CONFLICT (id) DO NOTHING;

-- Lecture par les membres authentifiés (le gestionnaire gère ; l'apprenant
-- reçoit une signed URL générée côté serveur via service_role).
CREATE POLICY "pedagogical_member_read"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'pedagogical');
```

- [ ] **Step 2: Appliquer**

Run: `pnpm db:reset`
Expected: bucket `pedagogical` créé (ou PENDING).

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0050_pedagogical_bucket.sql
git commit -m "feat(storage): bucket privé pedagogical pour supports (50MB, multi-format)"
```

---

## Task 4: Tests pgTAP — isolation tenant des 2 tables

**Files:**
- Create: `supabase/tests/0048_test_module_resources_rls.sql`
- Create: `supabase/tests/0049_test_resource_access_log_rls.sql`

- [ ] **Step 1: Écrire le test `module_resources`** (pattern de `supabase/tests/0045_test_rls_by_role_learners.sql` + `_helpers.sql`)

```sql
-- Tests pgTAP : isolation tenant + apprenant sans accès direct — module_resources
BEGIN;
SELECT plan(3);

SELECT tests.as_service_role();

INSERT INTO app.organizations (id, name, legal_name, siret) VALUES
  ('00aaa000-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'OF A', 'OF A SARL', '11111111111111'),
  ('00bbb000-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'OF B', 'OF B SARL', '22222222222222');

INSERT INTO auth.users (id, email, instance_id, aud, role) VALUES
  ('usra-001-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a@of.test', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');
INSERT INTO app.profiles (user_id, full_name, email) VALUES
  ('usra-001-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'User A', 'a@of.test');
INSERT INTO app.members (organization_id, user_id, role, is_default_org) VALUES
  ('00aaa000-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'usra-001-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'owner'::app.member_role, true);

-- Un module + un support dans chaque org (réutiliser un module catalogue : à créer minimalement)
INSERT INTO app.modules (id, organization_id, title) VALUES
  ('11110000-0000-0000-0000-000000000001', '00aaa000-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Module A'),
  ('11110000-0000-0000-0000-000000000002', '00bbb000-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Module B');
INSERT INTO app.module_resources (organization_id, module_id, title, storage_path, mime_type) VALUES
  ('00aaa000-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11110000-0000-0000-0000-000000000001', 'Slides A', 'a/slides.pdf', 'application/pdf'),
  ('00bbb000-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '11110000-0000-0000-0000-000000000002', 'Slides B', 'b/slides.pdf', 'application/pdf');

-- User A (org A) ne voit que le support de son org
SELECT tests.authenticate_as('usra-001-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
SELECT is(
  (SELECT count(*) FROM app.module_resources)::int, 1,
  'membre org A ne voit que le support de son org'
);
SELECT is(
  (SELECT count(*) FROM app.module_resources WHERE organization_id = '00bbb000-bbbb-bbbb-bbbb-bbbbbbbbbbbb')::int, 0,
  'membre org A ne voit pas le support de org B'
);

-- Rôle anon (apprenant) : aucun accès direct
SELECT tests.clear_authentication();
SELECT is(
  (SELECT count(*) FROM app.module_resources)::int, 0,
  'anon (apprenant) n''a aucun accès direct à module_resources'
);

SELECT * FROM finish();
ROLLBACK;
```

> Adapter les noms d'helpers (`tests.authenticate_as`, `tests.clear_authentication`, colonnes de `app.modules`) à ce qui existe réellement dans `supabase/tests/_helpers.sql` et `0005_catalog.sql`. **Vérifier d'abord** : `cat supabase/tests/_helpers.sql` et `sed -n '36,52p' supabase/migrations/0005_catalog.sql`.

- [ ] **Step 2: Écrire le test `resource_access_log`** (mêmes helpers ; vérifie SELECT tenant + INSERT refusé en authenticated)

```sql
BEGIN;
SELECT plan(2);

SELECT tests.as_service_role();
INSERT INTO app.organizations (id, name, legal_name, siret) VALUES
  ('00aaa000-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'OF A', 'OF A SARL', '11111111111111');
INSERT INTO auth.users (id, email, instance_id, aud, role) VALUES
  ('usra-001-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a@of.test', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');
INSERT INTO app.profiles (user_id, full_name, email) VALUES
  ('usra-001-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'User A', 'a@of.test');
INSERT INTO app.members (organization_id, user_id, role, is_default_org) VALUES
  ('00aaa000-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'usra-001-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'owner'::app.member_role, true);
INSERT INTO app.resource_access_log (organization_id, target_kind, target_id, actor_kind, action) VALUES
  ('00aaa000-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'document', '11110000-0000-0000-0000-0000000000aa', 'system', 'view');

SELECT tests.authenticate_as('usra-001-aaaa-aaaa-aaaa-aaaaaaaaaaaa');

SELECT is(
  (SELECT count(*) FROM app.resource_access_log)::int, 1,
  'membre org voit les lignes d''audit de son org'
);

-- INSERT interdit pour un membre authentifié (pas de policy INSERT)
SELECT throws_ok(
  $$ INSERT INTO app.resource_access_log (organization_id, target_kind, target_id, actor_kind, action)
     VALUES ('00aaa000-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'document', gen_random_uuid(), 'user', 'view') $$,
  '42501',
  NULL,
  'INSERT refusé en authenticated (réservé service_role)'
);

SELECT * FROM finish();
ROLLBACK;
```

- [ ] **Step 3: Lancer les tests**

Run: `pnpm db:test`
Expected: tous les `ok`, 0 `not ok`. Si Docker down → **PENDING**.

- [ ] **Step 4: Commit**

```bash
git add supabase/tests/0048_test_module_resources_rls.sql supabase/tests/0049_test_resource_access_log_rls.sql
git commit -m "test(rls): pgTAP isolation tenant module_resources + resource_access_log"
```

---

## Task 5: Fonction pure d'assiduité (domain) + unit tests

**Files:**
- Create: `apps/web/features/attendance/assiduite.ts`
- Test: `apps/web/features/attendance/assiduite.test.ts`

- [ ] **Step 1: Écrire le test (échoue)**

```ts
import { describe, it, expect } from 'vitest';
import { computeAssiduite, type SessionDuration } from './assiduite';

describe('computeAssiduite', () => {
  it('retourne 0/0 sans session', () => {
    expect(computeAssiduite([])).toEqual({ heuresSignees: 0, heuresPlanifiees: 0, taux: 0 });
  });

  it('somme les heures planifiées et signées', () => {
    const sessions: SessionDuration[] = [
      { durationHours: 3.5, signed: true },
      { durationHours: 3.5, signed: true },
      { durationHours: 3.5, signed: false },
    ];
    expect(computeAssiduite(sessions)).toEqual({ heuresSignees: 7, heuresPlanifiees: 10.5, taux: 2 / 3 });
  });

  it('ignore les durées nulles ou négatives côté planifié', () => {
    const sessions: SessionDuration[] = [
      { durationHours: 0, signed: true },
      { durationHours: 2, signed: true },
    ];
    expect(computeAssiduite(sessions)).toEqual({ heuresSignees: 2, heuresPlanifiees: 2, taux: 1 });
  });
});
```

- [ ] **Step 2: Lancer le test → échec**

Run: `pnpm --filter web test assiduite`
Expected: FAIL — `computeAssiduite` introuvable.

- [ ] **Step 3: Implémenter**

```ts
// Fonction pure : zéro import de next/supabase/react (domain layer).
export type SessionDuration = {
  durationHours: number;
  signed: boolean;
};

export type Assiduite = {
  heuresSignees: number;
  heuresPlanifiees: number;
  taux: number; // 0..1
};

export function computeAssiduite(sessions: SessionDuration[]): Assiduite {
  let heuresSignees = 0;
  let heuresPlanifiees = 0;
  for (const s of sessions) {
    if (s.durationHours <= 0) continue;
    heuresPlanifiees += s.durationHours;
    if (s.signed) heuresSignees += s.durationHours;
  }
  const taux = heuresPlanifiees > 0 ? heuresSignees / heuresPlanifiees : 0;
  return { heuresSignees, heuresPlanifiees, taux };
}
```

- [ ] **Step 4: Lancer le test → succès**

Run: `pnpm --filter web test assiduite`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/features/attendance/assiduite.ts apps/web/features/attendance/assiduite.test.ts
git commit -m "feat(attendance): fonction pure computeAssiduite + tests"
```

---

## Task 6: RPC `get_apprenant_resources` + helper SQL assiduité

**Files:**
- Create: `supabase/migrations/0051_apprenant_resources_rpc.sql`

- [ ] **Step 1: Écrire la migration** (style de `0028_apprenant_rpcs.sql` : `SECURITY DEFINER`, `search_path = app, public`, retour JSONB)

```sql
-- ============================================================================
-- 0051 — RPC ressources apprenant (documents réels + supports + assiduité)
-- ============================================================================
-- Token JWT apprenant vérifié côté Next.js ; learner_id passé ici.

CREATE OR REPLACE FUNCTION app.get_apprenant_resources(
  p_learner_id UUID
)
RETURNS JSONB
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = app, public
AS $$
  WITH dossier_actif AS (
    SELECT d.id, d.organization_id, d.status
    FROM app.dossiers d
    WHERE d.learner_id = p_learner_id
    ORDER BY d.start_date DESC
    LIMIT 1
  )
  SELECT jsonb_build_object(
    'dossier_id', (SELECT id FROM dossier_actif),
    'documents', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', doc.id,
        'kind', doc.kind,
        'title', doc.title,
        -- statut d'affichage dérivé
        'display_status', CASE
          WHEN EXISTS (
            SELECT 1 FROM app.document_signatures s
            WHERE s.document_id = doc.id AND s.status = 'signed'
          ) THEN 'signed'
          WHEN doc.status = 'ready' THEN 'available'
          ELSE 'pending'
        END,
        'generated_at', doc.generated_at,
        'file_size_bytes', doc.file_size_bytes
      ) ORDER BY doc.created_at)
      FROM app.documents doc, dossier_actif da
      WHERE doc.dossier_id = da.id
        AND doc.deleted_at IS NULL
    ), '[]'::jsonb),
    'supports', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'module_id', dm.module_id,
        'module_title', dm.title_snapshot,
        'module_position', dm.position,
        'resources', COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
            'id', mr.id,
            'title', mr.title,
            'mime_type', mr.mime_type,
            'file_size_bytes', mr.file_size_bytes
          ) ORDER BY mr.position)
          FROM app.module_resources mr
          WHERE mr.module_id = dm.module_id
            AND mr.is_published = true
            AND mr.deleted_at IS NULL
        ), '[]'::jsonb)
      ) ORDER BY dm.position)
      FROM app.dossier_modules dm, dossier_actif da
      WHERE dm.dossier_id = da.id
    ), '[]'::jsonb),
    'assiduite', (
      SELECT jsonb_build_object(
        'heures_planifiees', COALESCE(SUM(
          EXTRACT(EPOCH FROM (s.ends_at - s.starts_at)) / 3600.0
        ), 0),
        'heures_signees', COALESCE(SUM(
          CASE WHEN EXISTS (
            SELECT 1 FROM app.attendance_sheets ash
            JOIN app.attendance_signatures sig ON sig.attendance_sheet_id = ash.id
            WHERE ash.session_id = s.id
              AND sig.learner_id = p_learner_id
              AND sig.signed_at IS NOT NULL
          ) THEN EXTRACT(EPOCH FROM (s.ends_at - s.starts_at)) / 3600.0 ELSE 0 END
        ), 0)
      )
      FROM app.sessions s, dossier_actif da
      WHERE s.dossier_id = da.id
        AND s.status <> 'cancelled'
    )
  );
$$;

GRANT EXECUTE ON FUNCTION app.get_apprenant_resources(UUID) TO anon, authenticated, service_role;
```

> **Vérifier** les noms de colonnes réels avant d'écrire : `app.sessions(starts_at, ends_at, status, dossier_id)` (migration `0008`), `app.attendance_signatures(learner_id, signed_at, attendance_sheet_id)` (`0008`), `app.documents(file_size_bytes, generated_at, status, dossier_id, deleted_at)` (`0009`), `app.dossier_modules(module_id, title_snapshot, position, dossier_id)`. Reproduire le `GRANT` tel que pratiqué pour `get_apprenant_dashboard` (`grep -n "GRANT EXECUTE" supabase/migrations/0028_apprenant_rpcs.sql`).

- [ ] **Step 2: Appliquer**

Run: `pnpm db:reset`
Expected: fonction créée (ou PENDING).

- [ ] **Step 3: Smoke test manuel (si DB dispo)**

Run: `psql "$DATABASE_URL" -c "SELECT app.get_apprenant_resources('<un learner_id seed>');"`
Expected: JSONB avec clés `dossier_id`, `documents`, `supports`, `assiduite`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0051_apprenant_resources_rpc.sql
git commit -m "feat(apprenant): RPC get_apprenant_resources (documents réels + supports + assiduité)"
```

---

## Task 7: Resolver apprenant + helper de journalisation (serveur)

**Files:**
- Create: `apps/web/app/(apprenant)/espace/[token]/resources.ts`

- [ ] **Step 1: Écrire le resolver + le logger**

```ts
import 'server-only';
import { headers } from 'next/headers';
import { verifyApprenantToken } from '@/shared/lib/apprenant-token';
import { supabaseServer } from '@/shared/lib/supabase/server';
import { supabaseAdmin } from '@/shared/lib/supabase/admin';

export type ApprenantDocument = {
  id: string;
  kind: string;
  title: string;
  displayStatus: 'signed' | 'available' | 'pending';
  generatedAt: string | null;
  fileSizeBytes: number | null;
};

export type ApprenantModuleSupports = {
  moduleId: string;
  moduleTitle: string;
  modulePosition: number;
  resources: Array<{ id: string; title: string; mimeType: string; fileSizeBytes: number | null }>;
};

export type ApprenantResources = {
  dossierId: string;
  documents: ApprenantDocument[];
  supports: ApprenantModuleSupports[];
  assiduite: { heuresPlanifiees: number; heuresSignees: number };
};

type RpcShape = {
  dossier_id: string;
  documents: Array<{ id: string; kind: string; title: string; display_status: ApprenantDocument['displayStatus']; generated_at: string | null; file_size_bytes: number | null }>;
  supports: Array<{ module_id: string; module_title: string; module_position: number; resources: Array<{ id: string; title: string; mime_type: string; file_size_bytes: number | null }> }>;
  assiduite: { heures_planifiees: number; heures_signees: number };
};

export async function resolveApprenantResources(token: string): Promise<ApprenantResources | null> {
  const verified = await verifyApprenantToken(token);
  if (!verified.ok) return null;

  const sb = supabaseServer();
  const { data, error } = await sb.rpc(
    'get_apprenant_resources' as never,
    { p_learner_id: verified.value.learnerId } as never,
  );
  if (error || !data) return null;

  const d = data as unknown as RpcShape;
  return {
    dossierId: d.dossier_id,
    documents: d.documents.map((x) => ({
      id: x.id,
      kind: x.kind,
      title: x.title,
      displayStatus: x.display_status,
      generatedAt: x.generated_at,
      fileSizeBytes: x.file_size_bytes,
    })),
    supports: d.supports.map((m) => ({
      moduleId: m.module_id,
      moduleTitle: m.module_title,
      modulePosition: m.module_position,
      resources: m.resources.map((r) => ({ id: r.id, title: r.title, mimeType: r.mime_type, fileSizeBytes: r.file_size_bytes })),
    })),
    assiduite: { heuresPlanifiees: d.assiduite.heures_planifiees, heuresSignees: d.assiduite.heures_signees },
  };
}

/** Journalise un accès apprenant. Écrit via service_role (bypass RLS, INSERT-only). */
export async function logResourceAccess(opts: {
  token: string;
  targetKind: 'document' | 'module_resource' | 'replay';
  targetId: string;
  action: 'view' | 'download';
}): Promise<void> {
  const verified = await verifyApprenantToken(opts.token);
  if (!verified.ok) return; // pas de log si token invalide ; l'appelant gère le 401

  const h = headers();
  const ipRaw = h.get('x-forwarded-for');
  const ip = ipRaw ? ipRaw.split(',')[0]?.trim() ?? null : null;
  const userAgent = h.get('user-agent');

  const admin = supabaseAdmin();
  await admin.schema('app').from('resource_access_log').insert({
    organization_id: verified.value.organizationId,
    target_kind: opts.targetKind,
    target_id: opts.targetId,
    dossier_id: verified.value.dossierId,
    learner_id: verified.value.learnerId,
    actor_kind: 'learner_token',
    action: opts.action,
    ip,
    user_agent: userAgent,
  });
}
```

> **Vérifier** la forme exacte du retour de `verifyApprenantToken` : `sed -n '60,96p' apps/web/shared/lib/apprenant-token.ts` (champs `learnerId`/`organizationId`/`dossierId` sur `verified.value`). Ajuster si les noms diffèrent.

- [ ] **Step 2: Vérifier la compilation**

Run: `pnpm --filter web build`
Expected: build OK (le fichier est importé au Task 10 ; ici on vérifie juste qu'il compile via un import temporaire OU on reporte la vérif au Task 10). Si build inchangé car non importé, passer.

- [ ] **Step 3: Commit**

```bash
git add "apps/web/app/(apprenant)/espace/[token]/resources.ts"
git commit -m "feat(apprenant): resolver get_apprenant_resources + helper logResourceAccess"
```

---

## Task 8: Route signed-URL des supports + log `download`

**Files:**
- Create: `apps/web/app/api/espace/[token]/resource/[id]/route.ts`

- [ ] **Step 1: Écrire la route**

```ts
import { NextResponse, type NextRequest } from 'next/server';
import { verifyApprenantToken } from '@/shared/lib/apprenant-token';
import { supabaseAdmin } from '@/shared/lib/supabase/admin';
import { logResourceAccess } from '@/app/(apprenant)/espace/[token]/resources';

export const dynamic = 'force-dynamic';

export async function GET(
  _req: NextRequest,
  { params }: { params: { token: string; id: string } },
) {
  const verified = await verifyApprenantToken(params.token);
  if (!verified.ok) {
    return NextResponse.json({ error: 'invalid_token' }, { status: 401 });
  }

  const admin = supabaseAdmin();

  // Le support doit appartenir à un module du dossier de l'apprenant.
  const { data: resource } = await admin
    .schema('app')
    .from('module_resources')
    .select('id, storage_path, module_id, organization_id, is_published, deleted_at')
    .eq('id', params.id)
    .maybeSingle();

  if (
    !resource ||
    resource.deleted_at !== null ||
    resource.is_published !== true ||
    resource.organization_id !== verified.value.organizationId
  ) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  const { data: link } = await admin
    .schema('app')
    .from('dossier_modules')
    .select('id')
    .eq('dossier_id', verified.value.dossierId)
    .eq('module_id', resource.module_id)
    .maybeSingle();

  if (!link) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  const { data: signed, error: signErr } = await admin
    .storage
    .from('pedagogical')
    .createSignedUrl(resource.storage_path, 120); // TTL 2 min

  if (signErr || !signed) {
    return NextResponse.json({ error: 'signing_failed' }, { status: 500 });
  }

  await logResourceAccess({
    token: params.token,
    targetKind: 'module_resource',
    targetId: resource.id,
    action: 'download',
  });

  return NextResponse.redirect(signed.signedUrl);
}
```

- [ ] **Step 2: Vérifier la compilation**

Run: `pnpm --filter web build`
Expected: build OK, la route `/api/espace/[token]/resource/[id]` apparaît dans la sortie.

- [ ] **Step 3: Commit**

```bash
git add "apps/web/app/api/espace/[token]/resource/[id]/route.ts"
git commit -m "feat(apprenant): route signed-URL supports + log download"
```

---

## Task 9: Log `download` sur les routes PDF existantes

**Files:**
- Modify: `apps/web/app/api/dossiers/[id]/convention.pdf/route.ts`
- Modify: `apps/web/app/api/dossiers/[id]/attestation.pdf/route.ts`

> Ces routes sont accédées avec l'`id` du dossier (pas le token apprenant). On logge avec `actor_kind = 'system'` (téléchargement déclenché par lien dans l'espace, mais sans contexte token ici). On résout `organization_id`/`learner_id` depuis le dossier.

- [ ] **Step 1: Ajouter un helper de log côté dossier**

Create snippet dans chaque route, juste avant le `return new NextResponse(...)` final. Pour `convention.pdf` (le `document_id` n'existe pas toujours ; on logge la cible `document` si un doc convention existe, sinon on logge l'événement avec `target_kind='document'` et `target_id` = id du dossier en repère). Implémentation minimale et sûre :

```ts
// après avoir chargé d (dossier) et avant le return PDF :
await sb.schema('app').from('resource_access_log').insert({
  organization_id: d.organization_id,
  target_kind: 'document',
  target_id: params.id,        // repère dossier (pas de doc row dédiée pour la convention générée à la volée)
  dossier_id: params.id,
  learner_id: d.learner_id ?? null,
  actor_kind: 'system',
  action: 'download',
});
```

> Adapter : `convention.pdf` sélectionne déjà `organization_id, learner_id`. Pour `attestation.pdf`, vérifier que ces deux colonnes sont bien dans le `select` ; les ajouter sinon.

- [ ] **Step 2: Vérifier la compilation**

Run: `pnpm --filter web build`
Expected: build OK.

- [ ] **Step 3: Commit**

```bash
git add "apps/web/app/api/dossiers/[id]/convention.pdf/route.ts" "apps/web/app/api/dossiers/[id]/attestation.pdf/route.ts"
git commit -m "feat(audit): log download sur routes PDF convention/attestation"
```

---

## Task 10: Câbler la page documents de l'espace sur le réel

**Files:**
- Modify: `apps/web/app/(apprenant)/espace/[token]/documents/page.tsx`

- [ ] **Step 1: Remplacer la source de données**

Remplacer l'import et la logique mock. Conserver la mise en page existante (header, sections, classes). Changements clés :

```ts
// en tête — remplacer l'import MOCK par le resolver réel + le logger
import { resolveApprenantContext } from '../_lib';
import { resolveApprenantResources, logResourceAccess } from '../resources';
```

Dans le composant, après `resolveApprenantContext` :

```ts
export default async function EspaceDocumentsPage({ params }: { params: { token: string } }) {
  const ctx = await resolveApprenantContext(params.token);
  if (!ctx) return notFound();

  const resources = await resolveApprenantResources(params.token);

  // Traçabilité passive : consultation de la page documents
  if (resources) {
    await logResourceAccess({
      token: params.token,
      targetKind: 'document',
      targetId: ctx.dossier.id,
      action: 'view',
    });
  }
  // ... rendu ci-dessous
}
```

- [ ] **Step 2: Brancher les documents administratifs réels**

Remplacer `buildAdminDocs(...)` par un mapping depuis `resources.documents`. Mapper `kind` → titre/icône, et utiliser `displayStatus`. Le `href` reste les routes existantes pour `convention`/`attestation` :

```ts
const adminDocs = (resources?.documents ?? []).map((doc) => ({
  id: doc.id,
  title: doc.title,
  type: 'PDF',
  size: doc.fileSizeBytes ? `${Math.round(doc.fileSizeBytes / 1024)} Ko` : '—',
  status: doc.displayStatus,
  date: doc.generatedAt ? new Date(doc.generatedAt).toLocaleDateString('fr-FR') : 'à venir',
  href:
    doc.kind === 'convention' ? `/api/dossiers/${ctx.dossier.id}/convention.pdf`
    : doc.kind === 'attestation_fin' || doc.kind === 'certificat_realisation' ? `/api/dossiers/${ctx.dossier.id}/attestation.pdf`
    : null,
  icon: doc.kind === 'attestation_fin' || doc.kind === 'certificat_realisation' ? Award : FileText,
}));
```

> Le reste du JSX de la section « Documents administratifs » est inchangé (il itère sur `adminDocs`).

- [ ] **Step 3: Brancher les supports par module réels**

Remplacer le bloc qui lit `MOCK_SUPPORTS_BY_MODULE[mod.id]`. Itérer sur `resources.supports` au lieu de `ctx.modules`, et pointer les liens vers la route signed-URL :

```tsx
{(resources?.supports ?? []).length === 0 ? (
  <p className="text-[13px] text-zinc-500 dark:text-zinc-400">Aucun module disponible pour le moment.</p>
) : (
  <div className="space-y-5">
    {resources!.supports.map((mod) => (
      <div key={mod.moduleId}>
        <div className="flex items-center gap-2 mb-2">
          <span className="w-6 h-6 rounded-md bg-violet-100 dark:bg-violet-950/40 text-violet-700 dark:text-violet-300 flex items-center justify-center text-[11px] font-medium">
            {mod.modulePosition + 1}
          </span>
          <p className="text-[13px] font-medium text-zinc-900 dark:text-zinc-100">{mod.moduleTitle}</p>
        </div>
        {mod.resources.length === 0 ? (
          <p className="text-[11px] text-zinc-400 ml-8">Aucun support disponible pour le moment.</p>
        ) : (
          <ul className="space-y-1 ml-8">
            {mod.resources.map((s) => (
              <li key={s.id}>
                <a
                  href={`/api/espace/${params.token}/resource/${s.id}`}
                  className="flex items-center justify-between gap-3 px-3 py-2 -mx-3 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-950 transition"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <FileText className="w-3.5 h-3.5 text-zinc-400 flex-shrink-0" />
                    <span className="text-[12px] text-zinc-900 dark:text-zinc-100 truncate">{s.title}</span>
                    <span className="text-[10px] text-zinc-400 font-mono">
                      {s.fileSizeBytes ? `${Math.round(s.fileSizeBytes / 1024)} Ko` : ''}
                    </span>
                  </div>
                  <Download className="w-3.5 h-3.5 text-zinc-400 flex-shrink-0" />
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>
    ))}
  </div>
)}
```

- [ ] **Step 4: Vérifier la compilation**

Run: `pnpm --filter web build`
Expected: build OK, plus aucune référence à `MOCK_SUPPORTS_BY_MODULE` dans ce fichier.

- [ ] **Step 5: Commit**

```bash
git add "apps/web/app/(apprenant)/espace/[token]/documents/page.tsx"
git commit -m "feat(apprenant): page documents câblée sur documents réels + supports + log view"
```

---

## Task 11: Compteurs réels du hub apprenant (assiduité)

**Files:**
- Modify: `apps/web/app/(apprenant)/espace/[token]/page.tsx`

- [ ] **Step 1: Lire le fichier et repérer les compteurs dérivés du mock**

Run: `sed -n '1,80p' "apps/web/app/(apprenant)/espace/[token]/page.tsx"`
Expected: localiser l'usage de `MOCK_EXERCISES`/`MOCK_ADMIN_DOCS` et les cartes de stats.

- [ ] **Step 2: Ajouter l'assiduité réelle**

Importer `resolveApprenantResources` et afficher `heuresSignees / heuresPlanifiees`. Remplacer le compteur de documents dérivé du mock par `resources.documents.length`. (Les exercices restent mock — hors-scope #1, ne pas y toucher au-delà du nécessaire à la compilation.)

```ts
import { resolveApprenantResources } from './resources';
// ...
const resources = await resolveApprenantResources(params.token);
const heuresSignees = resources?.assiduite.heuresSignees ?? 0;
const heuresPlanifiees = resources?.assiduite.heuresPlanifiees ?? 0;
const docsDispo = resources?.documents.filter((d) => d.displayStatus !== 'pending').length ?? 0;
```

Afficher dans une carte stat existante (réutiliser la classe d'une carte voisine) :

```tsx
<p className="text-[18px] font-semibold text-zinc-900 dark:text-zinc-100">
  {heuresSignees.toFixed(1)} h <span className="text-[12px] text-zinc-400">/ {heuresPlanifiees.toFixed(1)} h</span>
</p>
<p className="text-[11px] uppercase tracking-wider text-zinc-400 font-semibold">Assiduité</p>
```

- [ ] **Step 3: Vérifier la compilation**

Run: `pnpm --filter web build`
Expected: build OK.

- [ ] **Step 4: Commit**

```bash
git add "apps/web/app/(apprenant)/espace/[token]/page.tsx"
git commit -m "feat(apprenant): hub affiche assiduité réelle + nb documents disponibles"
```

---

## Task 12: Supprimer les mocks résiduels de `_lib.ts`

**Files:**
- Modify: `apps/web/app/(apprenant)/espace/[token]/_lib.ts`

- [ ] **Step 1: Supprimer `MOCK_ADMIN_DOCS` et `MOCK_SUPPORTS_BY_MODULE`**

Retirer les deux constantes (lignes ~186-205). **Conserver** `MOCK_EXERCISES` (utilisé par la page exercices, hors-scope #1) et le reste.

- [ ] **Step 2: Vérifier qu'aucun import ne casse**

Run: `grep -rn "MOCK_ADMIN_DOCS\|MOCK_SUPPORTS_BY_MODULE" apps/web && echo "RESTE DES REFS" || echo "OK aucune ref"`
Expected: `OK aucune ref`.

- [ ] **Step 3: Build**

Run: `pnpm --filter web build`
Expected: build OK.

- [ ] **Step 4: Commit**

```bash
git add "apps/web/app/(apprenant)/espace/[token]/_lib.ts"
git commit -m "refactor(apprenant): suppression mocks docs/supports (remplacés par données réelles)"
```

---

## Task 13: Gestionnaire — schéma + Server Actions upload supports

**Files:**
- Create: `apps/web/features/resources/upload-support.schema.ts`
- Create: `apps/web/app/(dashboard)/formations/[id]/supports/actions.ts`

- [ ] **Step 1: Schéma Zod partagé**

```ts
import { z } from 'zod';

export const uploadSupportSchema = z.object({
  moduleId: z.string().uuid(),
  title: z.string().min(1, 'Titre requis').max(200),
  description: z.string().max(1000).optional(),
  // fichier transmis séparément (FormData) ; ici les métadonnées validées
  storagePath: z.string().min(1),
  mimeType: z.string().min(1),
  fileSizeBytes: z.number().int().nonnegative().optional(),
});

export const togglePublishSchema = z.object({
  resourceId: z.string().uuid(),
  isPublished: z.boolean(),
});

export const deleteSupportSchema = z.object({
  resourceId: z.string().uuid(),
});
```

- [ ] **Step 2: Server Actions** (pattern `authActionClient` de `apps/web/shared/lib/safe-action.ts`)

```ts
'use server';
import { revalidatePath } from 'next/cache';
import { authActionClient } from '@/shared/lib/safe-action';
import { supabaseServer } from '@/shared/lib/supabase/server';
import { uploadSupportSchema, togglePublishSchema, deleteSupportSchema } from '@/features/resources/upload-support.schema';

export const createSupport = authActionClient
  .schema(uploadSupportSchema)
  .action(async ({ parsedInput, ctx }) => {
    const sb = supabaseServer();
    const { error } = await sb.schema('app').from('module_resources').insert({
      organization_id: ctx.organizationId,
      module_id: parsedInput.moduleId,
      title: parsedInput.title,
      description: parsedInput.description ?? null,
      storage_path: parsedInput.storagePath,
      mime_type: parsedInput.mimeType,
      file_size_bytes: parsedInput.fileSizeBytes ?? null,
      created_by: ctx.userId,
    });
    if (error) throw new Error(error.message);
    revalidatePath(`/formations`);
    return { ok: true };
  });

export const toggleSupportPublish = authActionClient
  .schema(togglePublishSchema)
  .action(async ({ parsedInput }) => {
    const sb = supabaseServer();
    const { error } = await sb.schema('app').from('module_resources')
      .update({ is_published: parsedInput.isPublished, updated_at: new Date().toISOString() })
      .eq('id', parsedInput.resourceId);
    if (error) throw new Error(error.message);
    revalidatePath(`/formations`);
    return { ok: true };
  });

export const deleteSupport = authActionClient
  .schema(deleteSupportSchema)
  .action(async ({ parsedInput }) => {
    const sb = supabaseServer();
    const { error } = await sb.schema('app').from('module_resources')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', parsedInput.resourceId);
    if (error) throw new Error(error.message);
    revalidatePath(`/formations`);
    return { ok: true };
  });
```

> **Vérifier** les noms exacts de `ctx` (`ctx.organizationId`, `ctx.userId`) dans `apps/web/shared/lib/safe-action.ts` (type `AuthCtx`, lignes 16-39) et ajuster. L'upload du fichier vers Storage `pedagogical` se fait côté client component (signed upload) ou via une action FormData ; **choix retenu** : upload client via `supabase.storage.from('pedagogical').upload(path, file)` avec un client authentifié (le bucket autorise `authenticated`), puis appel `createSupport` avec le `storagePath` retourné.

- [ ] **Step 3: Build**

Run: `pnpm --filter web build`
Expected: OK.

- [ ] **Step 4: Commit**

```bash
git add apps/web/features/resources/upload-support.schema.ts "apps/web/app/(dashboard)/formations/[id]/supports/actions.ts"
git commit -m "feat(resources): schéma + server actions upload/publish/delete supports"
```

---

## Task 14: Gestionnaire — page de gestion des supports

**Files:**
- Create: `apps/web/app/(dashboard)/formations/[id]/supports/page.tsx`

- [ ] **Step 1: Page serveur listant les modules de la formation + supports**

Charger les modules de la formation (`app.formation_modules` → `app.modules`) et leurs `module_resources` (org courante), afficher par module avec un composant client d'upload (drag-drop → Storage → `createSupport`) et les toggles publish/delete. Déclarer l'archétype en tête (`// ARCHETYPE: workflow`). Réutiliser les primitives UI existantes (`SectionLabel`, `StatusPill`, boutons charte v3).

> Le composant d'upload est un client component (`'use client'`) séparé (`supports-uploader.tsx`) appelant les actions du Task 13. Comme c'est de l'UI standard, suivre le pattern d'un autre écran d'upload du repo : `grep -rl "storage.from(" apps/web/app | head` (ex. avatar upload `profil`) pour calquer la logique de signed upload + état.

- [ ] **Step 2: Build + revue visuelle**

Run: `pnpm --filter web build`
Expected: route `/formations/[id]/supports` présente dans la sortie.

- [ ] **Step 3: Commit**

```bash
git add "apps/web/app/(dashboard)/formations/[id]/supports/"
git commit -m "feat(resources): écran gestionnaire gestion des supports par module"
```

---

## Task 15: Gestionnaire — traçabilité + export CSV

**Files:**
- Create: `apps/web/app/(dashboard)/dossiers/[id]/tracabilite/page.tsx`
- Create: `apps/web/app/api/dossiers/[id]/tracabilite.csv/route.ts`

- [ ] **Step 1: Page timeline d'accès**

Page serveur lisant `app.resource_access_log` filtré sur `dossier_id = params.id` (RLS limite à l'org courante), trié `occurred_at DESC`. Afficher : date/heure, action (vue/téléchargement), type de cible, et — pour `module_resource` — le titre du support (jointure applicative). Bouton « Exporter CSV » → `/api/dossiers/[id]/tracabilite.csv`. Archétype `// ARCHETYPE: command`.

```ts
// extrait data-fetch
const sb = supabaseServer();
const { data: rows } = await sb
  .schema('app')
  .from('resource_access_log')
  .select('id, target_kind, target_id, action, actor_kind, occurred_at')
  .eq('dossier_id', params.id)
  .order('occurred_at', { ascending: false })
  .limit(500);
```

- [ ] **Step 2: Route export CSV**

```ts
import { NextResponse, type NextRequest } from 'next/server';
import { supabaseServer } from '@/shared/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const sb = supabaseServer();
  const { data: rows, error } = await sb
    .schema('app')
    .from('resource_access_log')
    .select('occurred_at, action, target_kind, target_id, actor_kind, learner_id')
    .eq('dossier_id', params.id)
    .order('occurred_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const header = ['horodatage', 'action', 'type', 'cible', 'acteur', 'apprenant'];
  const escape = (v: unknown) => {
    const s = v == null ? '' : String(v);
    return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [
    header.join(';'),
    ...(rows ?? []).map((r) =>
      [r.occurred_at, r.action, r.target_kind, r.target_id, r.actor_kind, r.learner_id].map(escape).join(';'),
    ),
  ];
  const csv = '﻿' + lines.join('\r\n'); // BOM pour Excel FR

  return new NextResponse(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="tracabilite-${params.id}.csv"`,
    },
  });
}
```

- [ ] **Step 3: Build**

Run: `pnpm --filter web build`
Expected: routes `/dossiers/[id]/tracabilite` et `/api/dossiers/[id]/tracabilite.csv` présentes.

- [ ] **Step 4: Commit**

```bash
git add "apps/web/app/(dashboard)/dossiers/[id]/tracabilite/" "apps/web/app/api/dossiers/[id]/tracabilite.csv/"
git commit -m "feat(audit): écran traçabilité dossier + export CSV Qualiopi"
```

---

## Task 16: Régénérer les types + vérification finale

**Files:**
- Modify: `apps/web/shared/types/database.ts` (généré)

- [ ] **Step 1: Régénérer les types (si Docker dispo)**

Run: `pnpm db:types`
Expected: `database.ts` inclut `module_resources` et `resource_access_log`. Si Docker down → **PENDING**, retirer les `as never` ajoutés sur les `.from('module_resources')`/`.from('resource_access_log')` uniquement une fois les types régénérés.

- [ ] **Step 2: Build complet**

Run: `pnpm --filter web build`
Expected: `✓ Compiled successfully`, toutes les nouvelles routes listées.

- [ ] **Step 3: Suite unit**

Run: `pnpm --filter web test`
Expected: vert (au moins `assiduite.test.ts`).

- [ ] **Step 4: Commit**

```bash
git add apps/web/shared/types/database.ts
git commit -m "chore(types): régénère database.ts (module_resources, resource_access_log)"
```

---

## Task 17: E2E golden path

**Files:**
- Create: `apps/web/e2e/espace-ressources.spec.ts`

- [ ] **Step 1: Écrire le test E2E** (pattern Playwright existant : `ls apps/web/e2e/`)

Scénario : (1) gestionnaire connecté uploade un support sur un module d'une formation ; (2) génère/ouvre le lien espace apprenant du dossier qui contient ce module ; (3) sur `/espace/[token]/documents`, le support apparaît sous son module ; (4) le clic déclenche un download (statut 200/redirect) ; (5) côté gestionnaire, `/dossiers/[id]/tracabilite` affiche une ligne `module_resource` `download`.

> Réutiliser les helpers d'auth E2E du repo (`grep -rln "login\|signIn\|storageState" apps/web/e2e | head`). Si l'environnement E2E exige Supabase local et qu'il est indisponible → marquer le test `test.skip` avec un commentaire `PENDING: requiert stack Supabase locale` plutôt que le faire échouer.

- [ ] **Step 2: Lancer**

Run: `pnpm --filter web test:e2e espace-ressources`
Expected: PASS (ou skip documenté si stack indispo).

- [ ] **Step 3: Commit**

```bash
git add apps/web/e2e/espace-ressources.spec.ts
git commit -m "test(e2e): golden path supports apprenant + traçabilité"
```

---

## Task 18: Push

- [ ] **Step 1: Fetch + vérifier la branche**

Run: `git fetch origin -q && git status -sb | head -1`
Expected: `main` (ou branche de feature) — vérifier l'absence de divergence inattendue (sessions parallèles).

- [ ] **Step 2: Push**

Run: `git push origin main`
Expected: push accepté (Railway redéploie depuis GitHub).

---

## Self-review (auteur du plan)

- **Couverture spec :** supports module-scoped (T1,T6,T13,T14) ✓ ; documents réels dans l'espace (T6,T10) ✓ ; `resource_access_log` unifié append-only (T2) ✓ ; log view/download (T7,T8,T9,T10) ✓ ; assiduité (T5,T6,T11) ✓ ; bucket `pedagogical` (T3) ✓ ; RLS + pgTAP (T1,T2,T4) ✓ ; traçabilité gestionnaire + CSV (T15) ✓ ; suppression mocks (T12) ✓ ; `document_access_log` laissée dormante (jamais touchée) ✓ ; hors-scope replays/exercices non inclus ✓.
- **Cohérence des types :** `ApprenantResources`/`logResourceAccess` définis en T7 et consommés identiquement en T8/T10/T11 ; schémas Zod T13 consommés en T13/T14 ; `computeAssiduite` (T5) — la somme d'heures est aussi calculée en SQL (T6) : **les deux doivent rester cohérents** (la fonction pure sert aux tests/réutilisation ; la RPC fait foi en prod). Noté comme point de vigilance.
- **Placeholders :** les `> Vérifier ...` ne sont pas des trous d'implémentation mais des points d'alignement sur des helpers/colonnes réels du repo (RLS org helper, `AuthCtx`, retour `verifyApprenantToken`, colonnes de tables) — à confirmer par `grep`/`sed` indiqués avant d'écrire le code définitif. Aucun `TODO`/`TBD` fonctionnel.
