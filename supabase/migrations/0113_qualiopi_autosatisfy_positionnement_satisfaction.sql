-- ============================================================================
-- 0113 — Qualiopi : auto-satisfaction I5 (adaptation parcours) & I26/I27 (satisfaction)
-- ============================================================================
-- Prolonge 0111/0112 :
--   • I5  (adaptation du parcours) : satisfait quand le questionnaire de
--     positionnement est complété — OU preuve attachée.
--   • I26 (satisfaction à chaud) : satisfait quand le questionnaire
--     satisfaction_chaud est complété — OU preuve.
--   • I27 (satisfaction à froid) : satisfait quand le questionnaire
--     satisfaction_froid est complété — OU preuve.
-- Aucun nouveau trigger : la complétion d'un questionnaire recalcule déjà la
-- checklist du dossier (comme I10/I23).
-- ============================================================================

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
  v_formation UUID;
  v_has_objectives BOOLEAN := false;
  v_has_pedagogy   BOOLEAN := false;
  v_has_programme  BOOLEAN := false;
  v_has_evaluation BOOLEAN := false;
  v_details JSONB;
BEGIN
  SELECT organization_id, formation_id INTO v_org, v_formation
  FROM app.dossiers WHERE id = p_dossier_id;

  SELECT
    COALESCE(cardinality(array_remove(f.objectives, '')) > 0, false),
    COALESCE(btrim(f.pedagogical_method) <> '', false),
    COALESCE(
      (f.metadata -> 'catalog' -> 'programme') IS NOT NULL
      OR btrim(COALESCE(f.metadata -> 'catalog' ->> 'programContent', '')) <> ''
      OR btrim(COALESCE(f.description, '')) <> '',
      false),
    COALESCE(btrim(f.evaluation_method) <> '', false)
  INTO v_has_objectives, v_has_pedagogy, v_has_programme, v_has_evaluation
  FROM app.formations f
  WHERE f.id = v_formation;

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
      CASE
        WHEN r.number = 4 THEN v_has_objectives OR EXISTS (
          SELECT 1 FROM app.qualiopi_proofs p
          WHERE p.dossier_id = p_dossier_id AND p.indicator_id = r.indicator_id
            AND p.deleted_at IS NULL
            AND (p.valid_from IS NULL OR p.valid_from <= CURRENT_DATE)
            AND (p.valid_until IS NULL OR p.valid_until >= CURRENT_DATE))
        WHEN r.number = 5 THEN EXISTS (
          SELECT 1 FROM app.questionnaire_assignments qa
          JOIN app.questionnaire_templates qt ON qt.id = qa.template_id
          WHERE qa.dossier_id = p_dossier_id AND qt.kind = 'positionnement'
            AND qa.status = 'completed'
        ) OR EXISTS (
          SELECT 1 FROM app.qualiopi_proofs p
          WHERE p.dossier_id = p_dossier_id AND p.indicator_id = r.indicator_id
            AND p.deleted_at IS NULL
            AND (p.valid_from IS NULL OR p.valid_from <= CURRENT_DATE)
            AND (p.valid_until IS NULL OR p.valid_until >= CURRENT_DATE))
        WHEN r.number = 6 THEN v_has_pedagogy OR EXISTS (
          SELECT 1 FROM app.qualiopi_proofs p
          WHERE p.dossier_id = p_dossier_id AND p.indicator_id = r.indicator_id
            AND p.deleted_at IS NULL
            AND (p.valid_from IS NULL OR p.valid_from <= CURRENT_DATE)
            AND (p.valid_until IS NULL OR p.valid_until >= CURRENT_DATE))
        WHEN r.number = 7 THEN v_has_programme OR EXISTS (
          SELECT 1 FROM app.qualiopi_proofs p
          WHERE p.dossier_id = p_dossier_id AND p.indicator_id = r.indicator_id
            AND p.deleted_at IS NULL
            AND (p.valid_from IS NULL OR p.valid_from <= CURRENT_DATE)
            AND (p.valid_until IS NULL OR p.valid_until >= CURRENT_DATE))
        WHEN r.number = 8 THEN v_has_evaluation OR EXISTS (
          SELECT 1 FROM app.qualiopi_proofs p
          WHERE p.dossier_id = p_dossier_id AND p.indicator_id = r.indicator_id
            AND p.deleted_at IS NULL
            AND (p.valid_from IS NULL OR p.valid_from <= CURRENT_DATE)
            AND (p.valid_until IS NULL OR p.valid_until >= CURRENT_DATE))
        WHEN r.number = 15 THEN EXISTS (
          SELECT 1 FROM app.questionnaire_assignments qa
          JOIN app.questionnaire_templates qt ON qt.id = qa.template_id
          WHERE qa.dossier_id = p_dossier_id AND qt.kind = 'evaluation_acquis'
            AND qa.status = 'completed'
        ) OR EXISTS (
          SELECT 1 FROM app.qualiopi_proofs p
          WHERE p.dossier_id = p_dossier_id AND p.indicator_id = r.indicator_id
            AND p.deleted_at IS NULL
            AND (p.valid_from IS NULL OR p.valid_from <= CURRENT_DATE)
            AND (p.valid_until IS NULL OR p.valid_until >= CURRENT_DATE))
        WHEN r.number = 21 THEN EXISTS (
          SELECT 1 FROM app.dossier_trainers dt WHERE dt.dossier_id = p_dossier_id
        ) OR EXISTS (
          SELECT 1 FROM app.qualiopi_proofs p
          WHERE p.dossier_id = p_dossier_id AND p.indicator_id = r.indicator_id
            AND p.deleted_at IS NULL
            AND (p.valid_from IS NULL OR p.valid_from <= CURRENT_DATE)
            AND (p.valid_until IS NULL OR p.valid_until >= CURRENT_DATE))
        WHEN r.number = 26 THEN EXISTS (
          SELECT 1 FROM app.questionnaire_assignments qa
          JOIN app.questionnaire_templates qt ON qt.id = qa.template_id
          WHERE qa.dossier_id = p_dossier_id AND qt.kind = 'satisfaction_chaud'
            AND qa.status = 'completed'
        ) OR EXISTS (
          SELECT 1 FROM app.qualiopi_proofs p
          WHERE p.dossier_id = p_dossier_id AND p.indicator_id = r.indicator_id
            AND p.deleted_at IS NULL
            AND (p.valid_from IS NULL OR p.valid_from <= CURRENT_DATE)
            AND (p.valid_until IS NULL OR p.valid_until >= CURRENT_DATE))
        WHEN r.number = 27 THEN EXISTS (
          SELECT 1 FROM app.questionnaire_assignments qa
          JOIN app.questionnaire_templates qt ON qt.id = qa.template_id
          WHERE qa.dossier_id = p_dossier_id AND qt.kind = 'satisfaction_froid'
            AND qa.status = 'completed'
        ) OR EXISTS (
          SELECT 1 FROM app.qualiopi_proofs p
          WHERE p.dossier_id = p_dossier_id AND p.indicator_id = r.indicator_id
            AND p.deleted_at IS NULL
            AND (p.valid_from IS NULL OR p.valid_from <= CURRENT_DATE)
            AND (p.valid_until IS NULL OR p.valid_until >= CURRENT_DATE))
        WHEN r.source = 'proof' THEN EXISTS (
          SELECT 1 FROM app.qualiopi_proofs p
          WHERE p.dossier_id = p_dossier_id AND p.indicator_id = r.indicator_id
            AND p.deleted_at IS NULL
            AND (p.valid_from  IS NULL OR p.valid_from  <= CURRENT_DATE)
            AND (p.valid_until IS NULL OR p.valid_until >= CURRENT_DATE))
        WHEN r.source = 'questionnaire_positionnement' THEN EXISTS (
          SELECT 1 FROM app.questionnaire_assignments qa
          JOIN app.questionnaire_templates qt ON qt.id = qa.template_id
          WHERE qa.dossier_id = p_dossier_id AND qt.kind = 'positionnement'
            AND qa.status = 'completed')
        WHEN r.source = 'questionnaire_evaluation' THEN EXISTS (
          SELECT 1 FROM app.questionnaire_assignments qa
          JOIN app.questionnaire_templates qt ON qt.id = qa.template_id
          WHERE qa.dossier_id = p_dossier_id AND qt.kind = 'evaluation_acquis'
            AND qa.status = 'completed')
        WHEN r.source = 'attendance_signed' THEN (
          EXISTS (SELECT 1 FROM app.attendance_sheets s WHERE s.dossier_id = p_dossier_id)
          AND NOT EXISTS (SELECT 1 FROM app.attendance_sheets s
                          WHERE s.dossier_id = p_dossier_id AND s.status <> 'finalized'))
        WHEN r.source = 'document_signed' THEN EXISTS (
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
