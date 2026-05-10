-- ============================================================================
-- 0017 — Vues utiles & dashboards
-- ============================================================================

CREATE OR REPLACE VIEW app.v_dossiers_overview AS
SELECT
  d.id,
  d.organization_id,
  d.reference,
  d.status,
  d.modality,
  d.start_date,
  d.end_date,
  d.total_hours,
  d.total_amount_cents,
  d.qualiopi_ready,
  l.id   AS learner_id,
  l.first_name || ' ' || l.last_name AS learner_full_name,
  l.email AS learner_email,
  c.id   AS company_id,
  c.name AS company_name,
  f.id   AS formation_id,
  f.title AS formation_title,
  f.code  AS formation_code,
  (SELECT COUNT(*) FROM app.dossier_modules dm WHERE dm.dossier_id = d.id) AS modules_count,
  (SELECT COUNT(*) FROM app.sessions s WHERE s.dossier_id = d.id) AS sessions_count,
  (SELECT COUNT(*) FROM app.documents doc WHERE doc.dossier_id = d.id AND doc.deleted_at IS NULL) AS documents_count,
  (SELECT COUNT(*) FROM app.questionnaire_assignments qa
     WHERE qa.dossier_id = d.id AND qa.status NOT IN ('completed','expired')) AS questionnaires_pending,
  d.created_at,
  d.updated_at
FROM app.dossiers d
JOIN app.learners l   ON l.id = d.learner_id
LEFT JOIN app.companies c ON c.id = d.company_id
JOIN app.formations f ON f.id = d.formation_id
WHERE d.deleted_at IS NULL;

CREATE MATERIALIZED VIEW reports.mv_org_kpis AS
SELECT
  d.organization_id,
  COUNT(*) FILTER (WHERE d.status = 'active') AS dossiers_active,
  COUNT(*) FILTER (WHERE d.status = 'closed' AND d.closed_at >= date_trunc('month', now())) AS dossiers_closed_this_month,
  COUNT(*) FILTER (WHERE d.qualiopi_ready = false AND d.status IN ('active','completed')) AS dossiers_qualiopi_blocking,
  SUM(d.total_amount_cents) FILTER (WHERE d.status IN ('active','completed','closed')) AS revenue_in_progress_cents,
  AVG(NULLIF(qr.nps, NULL)) AS nps_avg
FROM app.dossiers d
LEFT JOIN app.questionnaire_responses qr
  ON qr.dossier_id = d.id AND qr.nps IS NOT NULL
WHERE d.deleted_at IS NULL
GROUP BY d.organization_id;

CREATE UNIQUE INDEX ON reports.mv_org_kpis (organization_id);
