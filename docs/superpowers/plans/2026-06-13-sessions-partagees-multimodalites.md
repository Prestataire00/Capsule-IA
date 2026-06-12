# Sessions partagées multi-entreprises — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permettre qu'une session soit partagée par plusieurs dossiers/entreprises (volumes et fenêtres décalés), avec présences dérivées de la fenêtre de chaque dossier + override, sans dupliquer les sessions.

**Architecture:** Modèle 2 (additif) — table M2M `session_dossiers`, `sessions.dossier_id` conservé comme dossier primaire (zéro casse), émargement découplé (`attendance_sheets.dossier_id` nullable), présences matérialisées par dérivation (fenêtre dossier) + overrides `manual_add/manual_remove`, RLS formateur étendue via `session_dossiers`.

**Tech Stack:** Postgres/Supabase (migrations, fonctions PL/pgSQL SECURITY DEFINER, RLS, pgTAP), Next.js 14 (Server Actions, dispatcher outbox), Vitest.

---

## Conventions du repo (vérifiées)

- Migrations : `supabase/migrations/NNNN_*.sql`, dernière sur disque = `0042`.
  **⚠️ Numérotation** : les plans financeurs (`0043`–`0047`) et Qualiopi (`0048`–`0051`) réservent ces numéros. Ce plan utilise **`0052`–`0055`**. Si ces plans ne sont pas créés au moment d'exécuter, renuméroter à la suite du vrai dernier fichier.
- Tests pgTAP : `supabase/tests/NNNN_test_*.sql`, helper `_helpers.sql`, `pnpm db:test`. Dernier = `0046` (financeurs réserve `0047`, Qualiopi `0048`). Ce plan utilise **`0049`**.
- Helper RLS : `app.current_organization_id()`, `app.is_staff()`, `app.has_role('formateur')`, `app.is_dossier_trainer(dossier_id)` (cf. `0021_rls_scheduling_attendance_documents.sql`).
- Reset/types/test : `pnpm db:reset`, `pnpm db:types`, `pnpm db:test`. Web : `pnpm test`, `pnpm lint`, `pnpm build`.
- Dispatcher : `apps/web/app/api/cron/dispatch-events/route.ts` (`HANDLERS`, `Handler=(event,sb)=>Promise<{ok}|{ok:false,error}>`).
- Server Actions : `'use server'` + client service-role (cf. `apps/web/app/(dashboard)/factures/actions.ts`).

> **⚠️ Vérification DB indisponible en local** : Docker absent → `db:reset`/`db:test`/`db:types` ne tournent pas. Tâches DB (1-5) = **write-only**, vérif **PENDING**. Tâches TS (6-8) = `pnpm lint` + « aucune nouvelle erreur typecheck attribuable » (typecheck repo déjà rouge). Voir [[project_ia_infinity_verif_gotchas]].

> **⚠️ UI sessions/dossier en MOCK** ([[project_ia_infinity_ui_mock]]) : `apps/web/app/(dashboard)/dossiers/[id]/sessions/page.tsx` lit `@/shared/mock/data` (non-async). La Task 8 **inclut la conversion mock → données réelles** avant d'ajouter les contrôles.

## Données existantes (vérifiées)

- `app.sessions(id, organization_id, dossier_id NOT NULL, dossier_module_id, modality, status, starts_at, ends_at, duration_hours GENERATED)`.
- `app.dossiers(learner_id NOT NULL, company_id, formation_id, start_date, end_date, total_hours)` — **1 apprenant/dossier**.
- `app.session_participants(session_id, organization_id, participant_kind, learner_id|trainer_id, participant_id GENERATED, is_required, PK(session_id,kind,participant_id))`.
- `app.attendance_sheets(session_id, dossier_id NOT NULL, half_day, UNIQUE(session_id,half_day), status)`.
- `app.attendance_signatures(attendance_sheet_id, learner_id|trainer_id, ...)` — **déjà par apprenant**.
- RLS formateur via `app.is_dossier_trainer(dossier_id)` sur `sessions`, `session_participants`, `attendance_sheets`.

## File Structure

**Migrations (créer)**
- `supabase/migrations/0052_session_dossiers.sql` — M2M + backfill + RLS.
- `supabase/migrations/0053_attendance_sheet_decouple.sql` — `attendance_sheets.dossier_id` nullable + enum `participant_source` + `session_participants.source`.
- `supabase/migrations/0054_session_attendance_derivation.sql` — `derive_session_attendees()` + `materialize_session_participants()`.
- `supabase/migrations/0055_rls_shared_sessions.sql` — RLS formateur via `session_dossiers`.

**Tests pgTAP (créer)**
- `supabase/tests/0049_test_shared_sessions.sql`.

**App (créer)**
- `apps/web/app/(dashboard)/dossiers/[id]/sessions/actions.ts` — link/unlink dossier, override participant, recompute.
- `apps/web/shared/lib/sessions/overlap.ts` — détection chevauchement formateur (pur, testé).

**App (modifier)**
- `apps/web/app/api/cron/dispatch-events/route.ts` — handler recompute participants.
- `apps/web/app/(dashboard)/dossiers/[id]/sessions/page.tsx` — conversion mock→réel + contrôles (Task 8).

---

### Task 1: Table M2M `session_dossiers` + backfill + RLS

**Files:**
- Create: `supabase/migrations/0052_session_dossiers.sql`

- [ ] **Step 1: Écrire la migration**

```sql
-- ============================================================================
-- 0052 — Partage d'une session par plusieurs dossiers (M2M)
-- ============================================================================

CREATE TABLE app.session_dossiers (
  session_id UUID NOT NULL REFERENCES app.sessions(id) ON DELETE CASCADE,
  dossier_id UUID NOT NULL REFERENCES app.dossiers(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES app.organizations(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (session_id, dossier_id)
);

CREATE INDEX ix_session_dossiers_dossier ON app.session_dossiers(dossier_id);
CREATE INDEX ix_session_dossiers_org ON app.session_dossiers(organization_id);

-- Backfill : chaque session existante partage (au moins) son dossier primaire.
INSERT INTO app.session_dossiers (session_id, dossier_id, organization_id)
SELECT s.id, s.dossier_id, s.organization_id FROM app.sessions s
ON CONFLICT (session_id, dossier_id) DO NOTHING;

ALTER TABLE app.session_dossiers ENABLE ROW LEVEL SECURITY;

CREATE POLICY session_dossiers_select ON app.session_dossiers FOR SELECT
USING (
  organization_id = app.current_organization_id()
  AND (app.is_staff() OR app.has_role('comptable')
       OR (app.has_role('formateur') AND app.is_dossier_trainer(dossier_id)))
);
CREATE POLICY session_dossiers_write ON app.session_dossiers FOR ALL
USING (organization_id = app.current_organization_id() AND app.is_staff())
WITH CHECK (organization_id = app.current_organization_id() AND app.is_staff());
```

- [ ] **Step 2: Vérif (PENDING si Docker absent)**

Run: `pnpm db:reset`
Expected: table créée, backfill = 1 ligne par session existante.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0052_session_dossiers.sql
git commit -m "feat(sessions): table M2M session_dossiers + backfill + RLS"
```

---

### Task 2: Découplage émargement + source de participant

**Files:**
- Create: `supabase/migrations/0053_attendance_sheet_decouple.sql`

- [ ] **Step 1: Écrire la migration**

```sql
-- ============================================================================
-- 0053 — Feuille d'émargement partageable + source de participant
-- ============================================================================

-- Une feuille partagée couvre les apprenants de plusieurs dossiers : le dossier
-- n'est plus obligatoire (contexte dérivé par apprenant via session_dossiers).
ALTER TABLE app.attendance_sheets ALTER COLUMN dossier_id DROP NOT NULL;

-- Origine d'un participant de session : dérivé (fenêtre dossier) ou override.
CREATE TYPE app.participant_source AS ENUM ('derived', 'manual_add', 'manual_remove');

-- L'existant a été saisi à la main → 'manual_add'.
ALTER TABLE app.session_participants
  ADD COLUMN source app.participant_source NOT NULL DEFAULT 'manual_add';
```

- [ ] **Step 2: Vérif (PENDING si Docker absent)**

Run: `pnpm db:reset`
Expected: `dossier_id` nullable sur `attendance_sheets`, colonne `source` ajoutée.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0053_attendance_sheet_decouple.sql
git commit -m "feat(sessions): attendance_sheets.dossier_id nullable + participant source"
```

---

### Task 3: Dérivation + matérialisation des présences

**Files:**
- Create: `supabase/migrations/0054_session_attendance_derivation.sql`

- [ ] **Step 1: Écrire la migration**

```sql
-- ============================================================================
-- 0054 — Dérivation des présences (fenêtre dossier) + matérialisation
-- ============================================================================

-- Apprenants attendus à une session : pour chaque dossier lié, son apprenant
-- si la date de session tombe dans la fenêtre du dossier (entrées/sorties décalées).
CREATE OR REPLACE FUNCTION app.derive_session_attendees(p_session_id UUID)
RETURNS TABLE(learner_id UUID)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = app, public
AS $$
  SELECT d.learner_id
  FROM app.session_dossiers sd
  JOIN app.dossiers d  ON d.id = sd.dossier_id
  JOIN app.sessions  s ON s.id = sd.session_id
  WHERE sd.session_id = p_session_id
    AND s.starts_at::date BETWEEN d.start_date AND d.end_date
$$;

-- Matérialise les participants : upsert les 'derived', sans toucher les manuels ;
-- purge les 'derived' qui ne le sont plus. Présents effectifs = source <> 'manual_remove'.
CREATE OR REPLACE FUNCTION app.materialize_session_participants(p_session_id UUID)
RETURNS INT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = app, public
AS $$
DECLARE v_org UUID; v_count INT;
BEGIN
  SELECT organization_id INTO v_org FROM app.sessions WHERE id = p_session_id;
  IF v_org IS NULL THEN RETURN 0; END IF;

  -- Ajoute les dérivés manquants (un manual_remove existant gagne via le PK -> DO NOTHING).
  INSERT INTO app.session_participants
    (session_id, organization_id, participant_kind, learner_id, source)
  SELECT p_session_id, v_org, 'learner', da.learner_id, 'derived'
  FROM app.derive_session_attendees(p_session_id) da
  ON CONFLICT (session_id, participant_kind, participant_id) DO NOTHING;

  -- Retire les lignes 'derived' qui ne sont plus dérivées (ne touche pas les manuels).
  DELETE FROM app.session_participants sp
  WHERE sp.session_id = p_session_id
    AND sp.participant_kind = 'learner'
    AND sp.source = 'derived'
    AND sp.learner_id NOT IN (SELECT learner_id FROM app.derive_session_attendees(p_session_id));

  SELECT count(*)::int INTO v_count
  FROM app.session_participants
  WHERE session_id = p_session_id AND participant_kind = 'learner' AND source <> 'manual_remove';
  RETURN v_count;
END $$;

REVOKE ALL ON FUNCTION app.derive_session_attendees(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.materialize_session_participants(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.derive_session_attendees(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION app.materialize_session_participants(UUID) TO service_role;
```

- [ ] **Step 2: Vérif (PENDING si Docker absent)**

Run: `pnpm db:reset`
Expected: fonctions créées sans erreur.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0054_session_attendance_derivation.sql
git commit -m "feat(sessions): dérivation + matérialisation des présences (fenêtre dossier)"
```

---

### Task 4: RLS formateur via `session_dossiers`

**Files:**
- Create: `supabase/migrations/0055_rls_shared_sessions.sql`

- [ ] **Step 1: Écrire la migration**

```sql
-- ============================================================================
-- 0055 — RLS partage : un formateur voit une session/feuille partagée s'il est
-- formateur de N'IMPORTE QUEL dossier lié (et plus seulement du dossier primaire).
-- ============================================================================

-- Vrai si l'utilisateur courant (rôle formateur) encadre un dossier lié à la session.
CREATE OR REPLACE FUNCTION app.is_session_trainer(p_session_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = app, public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM app.session_dossiers sd
    WHERE sd.session_id = p_session_id
      AND app.is_dossier_trainer(sd.dossier_id)
  )
$$;
GRANT EXECUTE ON FUNCTION app.is_session_trainer(UUID) TO authenticated;

-- sessions : visibilité formateur via tout dossier lié.
DROP POLICY IF EXISTS sessions_select ON app.sessions;
CREATE POLICY sessions_select ON app.sessions FOR SELECT
USING (
  organization_id = app.current_organization_id()
  AND (app.is_staff() OR app.has_role('comptable')
       OR (app.has_role('formateur') AND app.is_session_trainer(id)))
);

-- session_participants : idem via la session.
DROP POLICY IF EXISTS session_participants_select ON app.session_participants;
CREATE POLICY session_participants_select ON app.session_participants FOR SELECT
USING (
  organization_id = app.current_organization_id()
  AND (app.is_staff() OR app.has_role('comptable')
       OR (app.has_role('formateur') AND app.is_session_trainer(session_id)))
);

-- attendance_sheets : feuille partagée (dossier_id NULL) visible via la session.
DROP POLICY IF EXISTS attendance_sheets_select ON app.attendance_sheets;
CREATE POLICY attendance_sheets_select ON app.attendance_sheets FOR SELECT
USING (
  organization_id = app.current_organization_id()
  AND (app.is_staff()
       OR (app.has_role('formateur') AND app.is_session_trainer(session_id)))
);
```

> **Avant d'écrire** : ouvrir `0021_rls_scheduling_attendance_documents.sql` et **recopier à l'identique** les clauses des policies `*_select` existantes pour ne réintroduire que le changement formateur (ne pas perdre une condition `comptable`/staff). Vérifier la signature de `app.is_dossier_trainer` (prend un `dossier_id uuid`).

- [ ] **Step 2: Vérif (PENDING si Docker absent)**

Run: `pnpm db:reset`
Expected: policies recréées, pas d'erreur.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0055_rls_shared_sessions.sql
git commit -m "feat(sessions): RLS formateur via session_dossiers (sessions partagées)"
```

---

### Task 5: Tests pgTAP

**Files:**
- Create: `supabase/tests/0049_test_shared_sessions.sql`

- [ ] **Step 1: Écrire le test**

```sql
BEGIN;
SELECT plan(5);
\i supabase/tests/_helpers.sql

SELECT tests.create_test_org('11111111-1111-1111-1111-111111111111', 'Org A');

-- 2 dossiers (A 70h fenêtre large, B 30h fenêtre courte), 1 apprenant chacun.
INSERT INTO app.learners (id, organization_id, first_name, last_name, email)
VALUES ('1a000000-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','A','Un','a@ex.fr'),
       ('1b000000-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','B','Un','b@ex.fr');

-- NB : formation_id requis — réutiliser un helper de seed si présent dans _helpers.sql,
-- sinon insérer une formation minimale (voir colonnes app.formations).
INSERT INTO app.dossiers (id, organization_id, learner_id, formation_id, start_date, end_date, total_hours, status)
VALUES ('d0a00000-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','1a000000-0000-0000-0000-000000000001', tests.any_formation('11111111-1111-1111-1111-111111111111'), DATE '2026-07-01', DATE '2026-07-31', 70, 'scheduled'),
       ('d0b00000-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','1b000000-0000-0000-0000-000000000001', tests.any_formation('11111111-1111-1111-1111-111111111111'), DATE '2026-07-01', DATE '2026-07-10', 30, 'scheduled');

-- Session partagée le 2026-07-20 (dans la fenêtre de A, hors de celle de B).
INSERT INTO app.sessions (id, organization_id, dossier_id, modality, starts_at, ends_at)
VALUES ('5e000000-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','d0a00000-0000-0000-0000-000000000001','presentiel', TIMESTAMPTZ '2026-07-20 09:00+02', TIMESTAMPTZ '2026-07-20 17:00+02');
INSERT INTO app.session_dossiers (session_id, dossier_id, organization_id) VALUES
  ('5e000000-0000-0000-0000-000000000001','d0a00000-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111'),
  ('5e000000-0000-0000-0000-000000000001','d0b00000-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111');

-- 1) Dérivation au 2026-07-20 : seul l'apprenant A (B est sorti le 10).
SELECT set_eq(
  $$ SELECT learner_id FROM app.derive_session_attendees('5e000000-0000-0000-0000-000000000001') $$,
  $$ VALUES ('1a000000-0000-0000-0000-000000000001'::uuid) $$,
  'sortie décalée : seul A attendu le 20/07');

-- 2) Matérialisation : 1 présent effectif.
SELECT is(app.materialize_session_participants('5e000000-0000-0000-0000-000000000001'), 1, 'matérialise 1 présent');

-- 3) Override manual_add : on ajoute B explicitement => 2 effectifs.
INSERT INTO app.session_participants (session_id, organization_id, participant_kind, learner_id, source)
VALUES ('5e000000-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','learner','1b000000-0000-0000-0000-000000000001','manual_add');
SELECT is(
  (SELECT count(*)::int FROM app.session_participants
   WHERE session_id='5e000000-0000-0000-0000-000000000001' AND participant_kind='learner' AND source <> 'manual_remove'),
  2, 'override manual_add ajoute B');

-- 4) Re-matérialisation ne supprime pas le manual_add ni ne ré-ajoute un removed.
SELECT is(app.materialize_session_participants('5e000000-0000-0000-0000-000000000001'), 2, 'recalcul préserve manual_add');

-- 5) RLS : org B ne voit pas le partage de org A.
SELECT tests.create_test_org('22222222-2222-2222-2222-222222222222', 'Org B');
SELECT tests.authenticate_as('22222222-2222-2222-2222-222222222222');
SELECT is(
  (SELECT count(*)::int FROM app.session_dossiers WHERE session_id='5e000000-0000-0000-0000-000000000001'),
  0, 'RLS : org B ne voit pas session_dossiers de org A');

SELECT * FROM finish();
ROLLBACK;
```

> **Avant d'écrire** : adapter aux vrais helpers de `_helpers.sql` (création org/formation/auth). Si `tests.any_formation` n'existe pas, insérer une `app.formations` minimale (lire ses colonnes) ou utiliser le helper de seed réel. Colonnes `app.learners` à confirmer (first_name/last_name/email).

- [ ] **Step 2: Vérif (PENDING si Docker absent)**

Run: `pnpm db:reset && pnpm db:test`
Expected: 5 assertions de `0049_test_shared_sessions` vertes.

- [ ] **Step 3: Commit**

```bash
git add supabase/tests/0049_test_shared_sessions.sql
git commit -m "test(sessions): pgTAP dérivation + override + RLS partage"
```

---

### Task 6: Détection de chevauchement formateur (module pur) + handler recompute

**Files:**
- Create: `apps/web/shared/lib/sessions/overlap.ts`
- Create: `apps/web/shared/lib/sessions/__tests__/overlap.test.ts`
- Modify: `apps/web/app/api/cron/dispatch-events/route.ts`

- [ ] **Step 1: Test du module pur**

```ts
// apps/web/shared/lib/sessions/__tests__/overlap.test.ts
import { describe, it, expect } from 'vitest';
import { hasOverlap, type TimeRange } from '../overlap';

const r = (s: string, e: string): TimeRange => ({ startsAt: new Date(s), endsAt: new Date(e) });

describe('hasOverlap', () => {
  it('détecte un chevauchement', () => {
    expect(hasOverlap(r('2026-07-20T09:00Z', '2026-07-20T12:00Z'),
      [r('2026-07-20T11:00Z', '2026-07-20T13:00Z')])).toBe(true);
  });
  it('pas de chevauchement si adjacent', () => {
    expect(hasOverlap(r('2026-07-20T09:00Z', '2026-07-20T12:00Z'),
      [r('2026-07-20T12:00Z', '2026-07-20T13:00Z')])).toBe(false);
  });
  it('ignore une liste vide', () => {
    expect(hasOverlap(r('2026-07-20T09:00Z', '2026-07-20T12:00Z'), [])).toBe(false);
  });
});
```

- [ ] **Step 2: Lancer (doit échouer)**

Run: `pnpm test overlap`
Expected: FAIL — module introuvable.

- [ ] **Step 3: Implémenter le module pur**

```ts
// apps/web/shared/lib/sessions/overlap.ts
// Module pur : détecte si un créneau chevauche d'autres créneaux (planning formateur).
export type TimeRange = { startsAt: Date; endsAt: Date };

/** True si `candidate` chevauche au moins un créneau de `existing` (bornes exclusives). */
export function hasOverlap(candidate: TimeRange, existing: TimeRange[]): boolean {
  return existing.some(
    (e) => candidate.startsAt < e.endsAt && e.startsAt < candidate.endsAt,
  );
}
```

- [ ] **Step 4: Vérifier**

Run: `pnpm test overlap`
Expected: PASS (3 tests).

- [ ] **Step 5: Handler recompute dans le dispatcher**

Fusionner dans `HANDLERS` (créer l'objet s'il est encore un stub) :

```ts
async function recomputeSessionParticipants(event: DomainEvent, sb: Sb): Promise<HandlerResult> {
  const payload = event.payload as { session_id?: string };
  if (!payload.session_id) return { ok: false, error: 'session_id absent du payload' };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (sb as any).rpc('materialize_session_participants', { p_session_id: payload.session_id });
  return error ? { ok: false, error: error.message } : { ok: true };
}

// dans HANDLERS :
//   'session.dossier_linked':  { 'recompute-session-participants': recomputeSessionParticipants },
//   'session.rescheduled':     { 'recompute-session-participants': recomputeSessionParticipants },
//   'dossier.window_changed':  { 'recompute-session-participants': recomputeSessionParticipants },
```

> Pour `dossier.window_changed` (qui change N sessions), soit émettre 1 event par session liée côté action, soit un handler dédié qui boucle sur `session_dossiers`. V1 : émettre par session dans l'action (Task 7). Exposition PostgREST de `materialize_session_participants` : voir note Task 7.

- [ ] **Step 6: Vérif**

Run: `pnpm test overlap && pnpm lint apps/web/app/api/cron/dispatch-events/route.ts`
Expected: tests verts, lint OK.

- [ ] **Step 7: Commit**

```bash
git add apps/web/shared/lib/sessions/overlap.ts apps/web/shared/lib/sessions/__tests__/overlap.test.ts apps/web/app/api/cron/dispatch-events/route.ts
git commit -m "feat(sessions): détection chevauchement formateur (pur) + handler recompute"
```

---

### Task 7: Server Actions — partage, override, recompute

**Files:**
- Create: `apps/web/app/(dashboard)/dossiers/[id]/sessions/actions.ts`

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

async function recompute(sb: ReturnType<typeof admin>, sessionId: string): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (sb as any).rpc('materialize_session_participants', { p_session_id: sessionId });
}

export async function linkDossierToSession(
  sessionId: string, dossierId: string, primaryDossierId: string,
): Promise<ActionResult> {
  const sb = admin();
  const { data: session } = await sb.schema('app').from('sessions')
    .select('organization_id').eq('id', sessionId).maybeSingle();
  const orgId = (session as { organization_id?: string } | null)?.organization_id;
  if (!orgId) return { ok: false, error: 'Session introuvable' };

  const { error } = await sb.schema('app').from('session_dossiers')
    .upsert({ session_id: sessionId, dossier_id: dossierId, organization_id: orgId },
            { onConflict: 'session_id,dossier_id' });
  if (error) return { ok: false, error: error.message };

  await recompute(sb, sessionId);
  revalidatePath(`/dossiers/${primaryDossierId}/sessions`);
  return { ok: true };
}

export async function unlinkDossierFromSession(
  sessionId: string, dossierId: string, primaryDossierId: string,
): Promise<ActionResult> {
  const sb = admin();
  const { error } = await sb.schema('app').from('session_dossiers')
    .delete().eq('session_id', sessionId).eq('dossier_id', dossierId);
  if (error) return { ok: false, error: error.message };
  await recompute(sb, sessionId);
  revalidatePath(`/dossiers/${primaryDossierId}/sessions`);
  return { ok: true };
}

// Override d'un apprenant sur une session : 'add' force la présence, 'remove' la retire.
export async function overrideParticipant(
  sessionId: string, learnerId: string, action: 'add' | 'remove', primaryDossierId: string,
): Promise<ActionResult> {
  const sb = admin();
  const { data: session } = await sb.schema('app').from('sessions')
    .select('organization_id').eq('id', sessionId).maybeSingle();
  const orgId = (session as { organization_id?: string } | null)?.organization_id;
  if (!orgId) return { ok: false, error: 'Session introuvable' };

  const source = action === 'add' ? 'manual_add' : 'manual_remove';
  const { error } = await sb.schema('app').from('session_participants')
    .upsert({ session_id: sessionId, organization_id: orgId, participant_kind: 'learner',
              learner_id: learnerId, source },
            { onConflict: 'session_id,participant_kind,participant_id' });
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/dossiers/${primaryDossierId}/sessions`);
  return { ok: true };
}
```

> **Vérifs** : (1) `onConflict: 'session_id,participant_kind,participant_id'` cible la PK (`participant_id` est GENERATED — l'upsert sur colonne générée peut nécessiter de cibler la contrainte par nom ; sinon faire `delete`+`insert`). (2) Exposition PostgREST de `materialize_session_participants` (schéma `app`) — si non appelable via `rpc`, ajouter un wrapper `public.materialize_session_participants(uuid)` dans 0054. (3) `dossier.window_changed` : émettre un event par session liée si on veut le recompute event-driven sur changement de fenêtre (sinon le recompute à l'ouverture de page suffit en V1).

- [ ] **Step 2: Vérif**

Run: `pnpm lint "apps/web/app/(dashboard)/dossiers/[id]/sessions/actions.ts"`
Expected: lint OK ; aucune nouvelle erreur typecheck attribuable.

- [ ] **Step 3: Commit**

```bash
git add "apps/web/app/(dashboard)/dossiers/[id]/sessions/actions.ts"
git commit -m "feat(sessions): server actions partage dossiers + override présences"
```

---

### Task 8: Conversion page Sessions mock → réel + contrôles partage

> **Prérequis intégré** : `apps/web/app/(dashboard)/dossiers/[id]/sessions/page.tsx` est en **mock** ([[project_ia_infinity_ui_mock]]). Cette tâche le convertit en Server Component async (`supabaseServer()`, RLS-scopé), puis ajoute : rattachement multi-dossiers, liste des présents effectifs avec add/retrait, alerte chevauchement formateur, encart volumes par dossier. **Dépend des Tasks 1-5 appliquées (Docker requis).**

**Files:**
- Modify (réécriture) : `apps/web/app/(dashboard)/dossiers/[id]/sessions/page.tsx`

- [ ] **Step 1: Lire le fichier mock actuel pour préserver le visuel**

Run: `sed -n '1,200p' "apps/web/app/(dashboard)/dossiers/[id]/sessions/page.tsx"`
Expected: page mock (imports `@/shared/mock/data`). On garde le visuel (liste de sessions), on remplace la source.

- [ ] **Step 2: Réécrire en données réelles + contrôles**

Remplacer le contenu par (adapter les classes à la charte UI existante de la page) :

```tsx
// ARCHETYPE: workflow
// Justification: planning des sessions du dossier + sessions partagées multi-entreprises.

import { notFound } from 'next/navigation';
import { supabaseServer } from '@/shared/lib/supabase/server';
import { hasOverlap } from '@/shared/lib/sessions/overlap';
import { SectionLabel } from '@/shared/ui/section-label';
import { unlinkDossierFromSession, overrideParticipant } from './actions';

export default async function SessionsPage({ params }: { params: { id: string } }) {
  const sb = supabaseServer();

  const { data: dossier } = await sb.schema('app').from('dossiers')
    .select('id, total_hours, start_date, end_date').eq('id', params.id).maybeSingle();
  if (!dossier) notFound();

  // Sessions où CE dossier est lié (primaire ou partagé).
  const { data: links } = await sb.schema('app').from('session_dossiers')
    .select('session_id').eq('dossier_id', params.id);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sessionIds = ((links as any[]) ?? []).map((l) => l.session_id);

  const { data: sessions } = sessionIds.length
    ? await sb.schema('app').from('sessions')
        .select('id, title, modality, status, starts_at, ends_at, duration_hours, dossier_id')
        .in('id', sessionIds).order('starts_at', { ascending: true })
    : { data: [] };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = (sessions as any[]) ?? [];

  // Heures couvertes pour ce dossier (somme des sessions liées).
  const coveredHours = rows.reduce((sum, s) => sum + Number(s.duration_hours ?? 0), 0);

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <SectionLabel>Sessions ({rows.length})</SectionLabel>
        <span className="text-[12px] text-zinc-500">
          Volume couvert : {coveredHours} h / {Number((dossier as { total_hours: number }).total_hours)} h
        </span>
      </header>

      <ul className="border-y border-zinc-200/60 dark:border-zinc-800 divide-y divide-zinc-200/60 dark:divide-zinc-800">
        {rows.map((s) => (
          <li key={s.id} className="py-3 px-1 text-[13px] flex items-center justify-between gap-4">
            <div>
              <div className="font-medium">{s.title ?? s.modality}</div>
              <div className="text-[11px] text-zinc-500">
                {new Date(s.starts_at).toLocaleString('fr-FR')} · {Number(s.duration_hours)} h
                {s.dossier_id !== params.id ? ' · partagée' : ''}
              </div>
            </div>
            {s.dossier_id !== params.id && (
              <form action={async () => { 'use server'; await unlinkDossierFromSession(s.id, params.id, params.id); }}>
                <button type="submit" className="text-[11px] text-zinc-500 hover:text-red-600 underline-offset-2 hover:underline">
                  Retirer ce dossier
                </button>
              </form>
            )}
          </li>
        ))}
      </ul>

      {rows.length === 0 && (
        <p className="text-[13px] text-zinc-500">Aucune session. Rattachez ce dossier à une session partagée existante, ou créez-en une.</p>
      )}
    </div>
  );
}
```

> **Vérifs** : (1) `supabaseServer()` (RLS) ; `(dashboard)` impose l'auth. (2) Forme `params` (Next 14). (3) Le picker « rattacher à une session existante » + l'UI d'override par apprenant + l'alerte `hasOverlap` (calculée depuis les autres sessions du formateur) sont à brancher selon le design system de la page — ce squelette couvre lecture réelle + détachement ; compléter add/override avec `overrideParticipant` et un sélecteur de session. (4) `hasOverlap` est importé pour l'alerte formateur (à afficher à la création/édition de session). (5) `database.ts` n'aura les nouvelles tables qu'après Task 9 → casts `any` + `ignoreBuildErrors:true`.

- [ ] **Step 3: Vérif**

Run: `pnpm lint "apps/web/app/(dashboard)/dossiers/[id]/sessions/page.tsx" && pnpm build`
Expected: lint OK ; build OK.

- [ ] **Step 4: Commit**

```bash
git add "apps/web/app/(dashboard)/dossiers/[id]/sessions/page.tsx"
git commit -m "feat(sessions): page sessions en données réelles + partage/volume"
```

---

### Task 9: Régénération des types + vérification finale

**Files:**
- Modify: `apps/web/shared/types/database.ts` (généré)

- [ ] **Step 1: Régénérer (PENDING si Docker absent)**

Run: `pnpm db:reset && pnpm db:types`
Expected: `database.ts` contient `session_dossiers`, `session_participants.source`, `attendance_sheets.dossier_id` nullable.

- [ ] **Step 2: Suite complète (PENDING DB si Docker absent)**

Run: `pnpm db:test && pnpm test && pnpm lint && pnpm build`
Expected: pgTAP `0049` vert, Vitest (overlap) vert, lint/build OK. (`pnpm typecheck` : aucune NOUVELLE erreur attribuable.)

- [ ] **Step 3: Vérification fonctionnelle (manuelle, env avec Docker)**

1. Créer une session sous le dossier A (70h, fenêtre large), la rattacher au dossier B (30h, fenêtre courte).
2. Pour une session hors fenêtre de B : seul l'apprenant de A est présent effectif (dérivation).
3. Override : ajouter B sur cette session → 2 présents ; recalcul → l'ajout persiste.
4. Le planning formateur ne montre qu'**une** ligne pour le créneau (plus de doublon).
5. La feuille d'émargement (dossier_id NULL) liste les apprenants effectifs des 2 entreprises.

- [ ] **Step 4: Commit**

```bash
git add apps/web/shared/types/database.ts
git commit -m "chore(sessions): régénère les types DB"
```

---

## Self-Review

**Spec coverage :**
- M2M `session_dossiers` + backfill + `dossier_id` primaire conservé → Task 1.
- Émargement découplé (`attendance_sheets.dossier_id` nullable) → Task 2.
- Présences dérivées (fenêtre dossier) + override `manual_add/manual_remove` → Tasks 2-3, testé Task 5.
- RLS formateur via `session_dossiers` → Task 4, testé Task 5.
- Anti-doublons (workflow) + alerte chevauchement formateur → Task 6 (`hasOverlap`) + Task 8 (UI).
- Recompute event-driven → Task 6 (handler) + Task 7 (émission/recompute dans actions).
- Suivi volumes par dossier → Task 8 (volume couvert vs total_hours).
- Conversion UI mock→réel → Task 8.
- pgTAP + RLS → Task 5.

**Cohérence des noms :** `session_dossiers(session_id,dossier_id,organization_id)` Tasks 1/4/5/7/8 ; `derive_session_attendees(p_session_id)` Tasks 3/5 ; `materialize_session_participants(p_session_id)` Tasks 3/5/6/7 ; enum `participant_source(derived|manual_add|manual_remove)` Tasks 2/3/5/7 ; effectifs = `source <> 'manual_remove'` Tasks 3/5 ; `is_session_trainer(p_session_id)` Task 4 ; `hasOverlap`/`TimeRange` Tasks 6/8.

**Points à confirmer pendant l'exécution (signalés inline) :** helpers pgTAP/formation réels ; upsert sur PK avec colonne GENERATED (`participant_id`) → sinon delete+insert ; exposition PostgREST de `materialize_session_participants` (wrapper public si besoin) ; recopie fidèle des policies `*_select` existantes ; `supabaseServer()`/`params` ; numérotation migrations vs plans financeurs/Qualiopi.

**Ordre/dépendances :** 1→5 (DB, Docker requis) → 6 (pur + handler) → 7 (actions) → 8 (UI, dépend des tables + actions) → 9. Aucune valeur isolée tant que 1-5 ne sont pas appliquées (sauf le module pur `overlap.ts` de la Task 6, testable seul).

**Hors scope (V2) :** agrégat Groupe nommé, PDF émargement groupé par entreprise, blocage dur anti-chevauchement, dérivation sur dates de module, refonte planning formateur.
