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
