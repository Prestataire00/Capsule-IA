-- ============================================================================
-- 0085 — Vue reporting (module 3.12 Dashboard & Reporting)
-- ============================================================================
-- Couche données des 7 KPIs de pilotage (Faouzi/Ismaël/Laurie). Complète
-- app.v_org_kpis (home, 0067) qui ne couvrait que dossiers actifs / blocage
-- Qualiopi / CA en cours / NPS. SECURITY INVOKER : chaque sous-requête hérite
-- de la RLS de sa table → résultat automatiquement borné à l'organisation de
-- l'appelant (vue mono-ligne, sans colonne organization_id). L'UI (home /
-- page reporting) consomme cette vue.

CREATE VIEW app.v_org_reporting WITH (security_invoker = true) AS
SELECT
  -- 1. Pipeline pré-inscription (demandes en cours) + ventilation par financeur
  (SELECT count(*) FROM app.prospects p
     WHERE p.status IN ('new', 'contacted', 'qualified') AND p.deleted_at IS NULL
  ) AS pipeline_prospects,
  (SELECT coalesce(jsonb_object_agg(t.fk, t.n), '{}'::jsonb) FROM (
     SELECT p.funder_kind::text AS fk, count(*) AS n
     FROM app.prospects p
     WHERE p.status IN ('new', 'contacted', 'qualified') AND p.deleted_at IS NULL
     GROUP BY p.funder_kind
  ) t) AS pipeline_by_funder,

  -- 2. Dossiers en formation
  (SELECT count(*) FROM app.dossiers d
     WHERE d.status IN ('active', 'scheduled') AND d.deleted_at IS NULL
  ) AS dossiers_active,

  -- 3. Conformité Qualiopi globale (% dossiers actifs/complétés prêts)
  (SELECT round(100.0 * count(*) FILTER (WHERE c.is_ready) / nullif(count(*), 0), 1)
     FROM app.qualiopi_dossier_checklists c
     JOIN app.dossiers d ON d.id = c.dossier_id
     WHERE d.status IN ('active', 'completed') AND d.deleted_at IS NULL
  ) AS qualiopi_conformity_pct,

  -- 4. Taux de retour des questionnaires de satisfaction
  (SELECT round(100.0 * count(*) FILTER (WHERE a.status = 'completed') / nullif(count(*), 0), 1)
     FROM app.questionnaire_assignments a
     JOIN app.questionnaire_templates qt ON qt.id = a.template_id
     WHERE qt.kind IN ('satisfaction_chaud', 'satisfaction_froid')
  ) AS questionnaire_return_rate_pct,

  -- 5. Heures dispensées vs prévues
  (SELECT coalesce(sum(h.hours_delivered), 0) FROM app.dossier_hours_tracking h) AS hours_delivered,
  (SELECT coalesce(sum(h.hours_planned), 0) FROM app.dossier_hours_tracking h)   AS hours_planned,

  -- 6. CA mois en cours (facturé ce mois / encaissé ce mois / à encaisser)
  (SELECT coalesce(sum(i.total_cents), 0) FROM app.invoices i
     WHERE i.deleted_at IS NULL AND i.status NOT IN ('draft', 'cancelled')
       AND i.issued_at >= date_trunc('month', now())::date
  ) AS ca_invoiced_month_cents,
  (SELECT coalesce(sum(i.total_cents), 0) FROM app.invoices i
     WHERE i.deleted_at IS NULL AND i.status = 'paid'
       AND i.paid_at >= date_trunc('month', now())
  ) AS ca_collected_month_cents,
  (SELECT coalesce(sum(i.total_cents), 0) FROM app.invoices i
     WHERE i.deleted_at IS NULL AND i.status IN ('issued', 'overdue', 'partially_paid')
  ) AS ca_outstanding_cents,

  -- 7. Réclamations ouvertes
  (SELECT count(*) FROM app.complaints c
     WHERE c.status IN ('open', 'in_progress')
  ) AS complaints_open;

GRANT SELECT ON app.v_org_reporting TO authenticated;

COMMENT ON VIEW app.v_org_reporting IS
  'KPIs reporting (module 3.12) par organisation — SECURITY INVOKER, RLS héritée. '
  'Complète app.v_org_kpis. Mono-ligne pour l''org de l''appelant.';
