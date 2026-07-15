-- ============================================================================
-- 0111 — Qualiopi : auto-satisfaction des indicateurs "contenu de formation"
-- ============================================================================
-- I4 (objectifs), I6 (modalités pédago), I7 (programme détaillé) et I8
-- (modalités d'évaluation) étaient de source 'proof' → il fallait TÉLÉVERSER une
-- preuve dans le dossier, alors que ces informations sont le CONTENU de la
-- formation (déjà saisi : objectifs, méthode, évaluation, programme).
--
-- Désormais ces 4 indicateurs sont satisfaits dès que le contenu correspondant
-- de la formation liée au dossier est renseigné — OU (rétro-compat) si une
-- preuve a déjà été attachée. Le reste du moteur est inchangé.
--
-- + Trigger : toute modification du contenu d'une formation recalcule la
--   checklist de ses dossiers non clôturés → passage au vert automatique.
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

  -- Contenu de la formation liée (source de vérité pour I4/I6/I7/I8).
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
        -- Indicateurs "contenu de formation" : satisfaits par le contenu OU une preuve.
        WHEN r.number = 4 THEN v_has_objectives OR EXISTS (
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

-- ── Trigger : recalcul auto des dossiers quand le contenu formation change ──
CREATE OR REPLACE FUNCTION app.tg_formation_recompute_qualiopi()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
  IF NEW.objectives         IS DISTINCT FROM OLD.objectives
     OR NEW.pedagogical_method IS DISTINCT FROM OLD.pedagogical_method
     OR NEW.evaluation_method  IS DISTINCT FROM OLD.evaluation_method
     OR NEW.description        IS DISTINCT FROM OLD.description
     OR NEW.metadata           IS DISTINCT FROM OLD.metadata THEN
    PERFORM app.recompute_qualiopi_checklist(d.id)
    FROM app.dossiers d
    WHERE d.formation_id = NEW.id
      AND d.status <> 'closed'
      AND d.deleted_at IS NULL;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS tg_formations_recompute_qualiopi ON app.formations;
CREATE TRIGGER tg_formations_recompute_qualiopi
  AFTER UPDATE ON app.formations
  FOR EACH ROW
  EXECUTE FUNCTION app.tg_formation_recompute_qualiopi();
