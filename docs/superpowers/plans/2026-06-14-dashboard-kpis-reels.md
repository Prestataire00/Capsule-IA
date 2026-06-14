# Plan — Dashboard KPIs réels (vue live + isolation RLS)

> Source : `docs/superpowers/specs/2026-06-14-dashboard-kpis-reels-design.md` (design validé).
> Périmètre de ce plan : couche DB uniquement (T1 vue live, T2 test pgTAP isolation).
> Environnement : write-only (Docker indisponible) — écrire le SQL, commiter, CI valide.

## Contexte vérifié (audit migrations)

- `app.dossiers` (0007) colonnes strictement NOT NULL **sans default** :
  `organization_id`, `reference`, `learner_id`, `formation_id`, `formation_snapshot`,
  `modality`, `start_date`, `end_date`, `total_hours` (CHECK > 0).
  `status` a un default (`'draft'`), `total_amount_cents` est nullable, `currency` a un default.
- `app.formations` (0005) colonnes strictement NOT NULL **sans default** :
  `organization_id`, `code`, `title`, `slug`, `default_duration_hours` (CHECK > 0).
- `app.questionnaire_responses` (0011) : `dossier_id` (NOT NULL), `nps` (nullable, 0..10).
- `reports.mv_org_kpis` (0017) existe mais n'est jamais rafraîchie → on crée une vue live.
- Prochain numéro de migration libre côté plan : **0067** (main ≈ 0063 + merges parallèles).

---

## Task 1 — Migration vue live `app.v_org_kpis`

Fichier : `supabase/migrations/0067_v_org_kpis.sql`

### Step 1 — Code exact

```sql
-- ============================================================================
-- 0067 — Vue live KPIs organisation (app.v_org_kpis)
-- ============================================================================
-- Vue SECURITY INVOKER : les KPIs sont calculés à la lecture (toujours frais),
-- et l'isolation multi-tenant est héritée des policies RLS de app.dossiers /
-- app.questionnaire_responses (contrairement à reports.mv_org_kpis figée).

CREATE VIEW app.v_org_kpis WITH (security_invoker = true) AS
SELECT
  d.organization_id,
  COUNT(*) FILTER (WHERE d.status = 'active')                                  AS dossiers_active,
  COUNT(*) FILTER (WHERE d.status = 'closed'
                     AND d.closed_at >= date_trunc('month', now()))           AS dossiers_closed_this_month,
  COUNT(*) FILTER (WHERE d.qualiopi_ready = false
                     AND d.status IN ('active','completed'))                   AS dossiers_qualiopi_blocking,
  COUNT(*) FILTER (WHERE d.status IN ('active','completed'))                   AS dossiers_active_completed,
  SUM(d.total_amount_cents) FILTER (WHERE d.status IN ('active','completed','closed')) AS revenue_in_progress_cents,
  AVG(qr.nps) AS nps_avg
FROM app.dossiers d
LEFT JOIN app.questionnaire_responses qr ON qr.dossier_id = d.id AND qr.nps IS NOT NULL
WHERE d.deleted_at IS NULL
GROUP BY d.organization_id;

GRANT SELECT ON app.v_org_kpis TO authenticated;

COMMENT ON VIEW app.v_org_kpis IS
  'KPIs live par organisation (SECURITY INVOKER, RLS héritée de app.dossiers). '
  'Remplace reports.mv_org_kpis (jamais rafraîchie) pour la home dashboard.';
```

### Step 2 — Self-review

- `WITH (security_invoker = true)` présent → RLS héritée.
- `GRANT SELECT ON app.v_org_kpis TO authenticated` présent.
- `COMMENT ON VIEW` présent.
- Colonnes alignées sur le design (ajout `dossiers_active_completed` pour le taux Qualiopi TS).

### Step 3 — Commit

```
feat(reports): vue live app.v_org_kpis pour KPIs dashboard (security invoker, RLS héritée)
```

---

## Task 2 — Test pgTAP isolation `app.v_org_kpis`

Fichier : `supabase/tests/0067_test_v_org_kpis_rls.sql`

### Step 1 — Code exact

```sql
-- ============================================================================
-- Tests pgTAP : app.v_org_kpis n'expose que l'organisation du JWT
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
  ('00ee0a00-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a@of.test', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');
INSERT INTO app.profiles (user_id, full_name, email) VALUES
  ('00ee0a00-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Owner A', 'a@of.test');
INSERT INTO app.members (organization_id, user_id, role, is_default_org) VALUES
  ('00aaa000-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '00ee0a00-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'owner'::app.member_role, true);

-- Apprenant + formation minimale par org (formations NOT NULL : code/title/slug/default_duration_hours)
INSERT INTO app.learners (id, organization_id, first_name, last_name, email) VALUES
  ('1ea00000-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '00aaa000-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Lea', 'A', 'lea-a@of.test'),
  ('1eb00000-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '00bbb000-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Leo', 'B', 'leo-b@of.test');

INSERT INTO app.formations (id, organization_id, code, title, slug, default_duration_hours) VALUES
  ('f0a00000-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '00aaa000-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'F-A', 'Formation A', 'formation-a', 14),
  ('f0b00000-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '00bbb000-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'F-B', 'Formation B', 'formation-b', 14);

-- Un dossier "active" par org (dossiers NOT NULL sans default : reference, learner_id,
-- formation_id, formation_snapshot, modality, start_date, end_date, total_hours)
INSERT INTO app.dossiers (
  id, organization_id, reference, learner_id, formation_id, formation_snapshot,
  status, modality, start_date, end_date, total_hours, total_amount_cents
)
SELECT
  'd0a00000-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '00aaa000-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'DOS-A',
  '1ea00000-aaaa-aaaa-aaaa-aaaaaaaaaaaa', f.id, '{}'::jsonb,
  'active'::app.dossier_status, 'presentiel'::app.training_modality,
  current_date, current_date + 7, 14, 120000
FROM app.formations f
WHERE f.organization_id = '00aaa000-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
LIMIT 1;

INSERT INTO app.dossiers (
  id, organization_id, reference, learner_id, formation_id, formation_snapshot,
  status, modality, start_date, end_date, total_hours, total_amount_cents
)
SELECT
  'd0b00000-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '00bbb000-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'DOS-B',
  '1eb00000-bbbb-bbbb-bbbb-bbbbbbbbbbbb', f.id, '{}'::jsonb,
  'active'::app.dossier_status, 'presentiel'::app.training_modality,
  current_date, current_date + 7, 14, 999000
FROM app.formations f
WHERE f.organization_id = '00bbb000-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
LIMIT 1;

-- Org A authentifiée
SELECT tests.as_authenticated();
SELECT tests.set_jwt(
  '00aaa000-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'owner',
  '00ee0a00-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
);

SELECT is(
  (SELECT count(*)::int FROM app.v_org_kpis),
  1,
  'Org A ne voit qu''une seule ligne KPI (la sienne) via la vue'
);

SELECT is(
  (SELECT dossiers_active::int FROM app.v_org_kpis
     WHERE organization_id = '00aaa000-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  1,
  'Org A : dossiers_active = 1'
);

SELECT tests.clear_jwt();
SELECT * FROM finish();
ROLLBACK;
```

### Step 2 — Self-review

- `plan(2)` ↔ 2 assertions `is(...)`.
- Termine par `SELECT * FROM finish(); ROLLBACK;`.
- Utilise `tests.as_service_role / as_authenticated / set_jwt / clear_jwt`.
- INSERTs dossiers fournissent toutes les colonnes NOT NULL sans default.

### Step 3 — Commit

```
test(reports): pgTAP isolation cross-tenant pour app.v_org_kpis
```
