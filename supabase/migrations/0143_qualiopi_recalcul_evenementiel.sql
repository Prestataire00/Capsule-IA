-- 0143 — Qualiopi : conformité recalculée dès que l'activité du dossier change
--
-- La check-list d'un dossier n'était recalculée qu'à l'affectation d'un
-- formateur, à la modification de la formation ou sur demande : un
-- questionnaire complété par l'apprenant, une feuille d'émargement finalisée
-- ou une preuve déposée restaient sans effet jusqu'au recalcul suivant. Les
-- événements prévus à cet effet (questionnaire.completed, attendance.finalized)
-- n'ont jamais été émis, et sept chemins de code différents complètent un
-- questionnaire. Des déclencheurs couvrent tous ces chemins d'un coup.
--
-- Indicateur 9 (information sur les conditions de déroulement) : la
-- convocation envoyée à l'apprenant, désormais journalisée avec son dossier,
-- ou un document de convocation généré, le valident automatiquement.
--
-- Rejouable.

-- ── 1. Moteur : vérification « convocation envoyée » ────────────────────────
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
  v_org        UUID;
  v_formation  UUID;
  v_action     TEXT;
  v_certifying BOOLEAN := false;
  v_checks     JSONB;
  v_details    JSONB;
BEGIN
  SELECT organization_id, formation_id, action_type::text
    INTO v_org, v_formation, v_action
  FROM app.dossiers WHERE id = p_dossier_id;

  -- Sans catégorie renseignée, le dossier est une action de formation (L. 6313-1, 1°).
  v_action := COALESCE(v_action, 'action_formation');

  -- Vérifications issues de la formation.
  SELECT
    jsonb_build_object(
      'formation_objectives',
        COALESCE(cardinality(array_remove(f.objectives, '')) > 0, false),
      'formation_pedagogy',
        COALESCE(btrim(f.pedagogical_method) <> '', false),
      'formation_programme',
        COALESCE(
          (f.metadata -> 'catalog' -> 'programme') IS NOT NULL
          OR btrim(COALESCE(f.metadata -> 'catalog' ->> 'programContent', '')) <> ''
          OR btrim(COALESCE(f.description, '')) <> '',
          false),
      'formation_evaluation_method',
        COALESCE(btrim(f.evaluation_method) <> '', false)
    ),
    COALESCE(btrim(COALESCE(f.rncp_code, '')) <> '' OR btrim(COALESCE(f.rs_code, '')) <> '', false)
  INTO v_checks, v_certifying
  FROM app.formations f
  WHERE f.id = v_formation;

  -- Vérifications issues de l'activité du dossier.
  v_checks := COALESCE(v_checks, '{}'::jsonb) || jsonb_build_object(
    'questionnaire_positionnement', EXISTS (
      SELECT 1 FROM app.questionnaire_assignments qa
      JOIN app.questionnaire_templates qt ON qt.id = qa.template_id
      WHERE qa.dossier_id = p_dossier_id AND qt.kind = 'positionnement'
        AND qa.status = 'completed'),
    'questionnaire_evaluation_acquis', EXISTS (
      SELECT 1 FROM app.questionnaire_assignments qa
      JOIN app.questionnaire_templates qt ON qt.id = qa.template_id
      WHERE qa.dossier_id = p_dossier_id AND qt.kind = 'evaluation_acquis'
        AND qa.status = 'completed'),
    'satisfaction_chaud', EXISTS (
      SELECT 1 FROM app.questionnaire_assignments qa
      JOIN app.questionnaire_templates qt ON qt.id = qa.template_id
      WHERE qa.dossier_id = p_dossier_id AND qt.kind = 'satisfaction_chaud'
        AND qa.status = 'completed'),
    'satisfaction_froid', EXISTS (
      SELECT 1 FROM app.questionnaire_assignments qa
      JOIN app.questionnaire_templates qt ON qt.id = qa.template_id
      WHERE qa.dossier_id = p_dossier_id AND qt.kind = 'satisfaction_froid'
        AND qa.status = 'completed'),
    'attendance_finalized', (
      EXISTS (SELECT 1 FROM app.attendance_sheets s WHERE s.dossier_id = p_dossier_id)
      AND NOT EXISTS (SELECT 1 FROM app.attendance_sheets s
                      WHERE s.dossier_id = p_dossier_id AND s.status <> 'finalized')),
    -- Indicateur 9 : convocation envoyée (J-7) ou document de convocation généré.
    'convocation_sent', (
      EXISTS (SELECT 1 FROM app.email_log e
              WHERE e.dossier_id = p_dossier_id AND e.kind LIKE 'convocation%'
                AND e.status = 'sent')
      OR EXISTS (SELECT 1 FROM app.documents doc
                 WHERE doc.dossier_id = p_dossier_id AND doc.kind = 'convocation'
                   AND doc.deleted_at IS NULL)),
    'trainer_assigned', EXISTS (
      SELECT 1 FROM app.dossier_trainers dt WHERE dt.dossier_id = p_dossier_id),
    'document_signed', EXISTS (
      SELECT 1 FROM app.documents d
      JOIN app.document_signatures ds ON ds.document_id = d.id
      WHERE d.dossier_id = p_dossier_id AND ds.status = 'signed')
  );

  WITH referentiel AS (
    -- Version en vigueur à la date du jour.
    SELECT i.*
    FROM app.qualiopi_indicators i
    WHERE i.scope = 'dossier'
      AND i.is_active
      AND i.referential_version <> 'legacy'
      AND (i.effective_from  IS NULL OR i.effective_from  <= CURRENT_DATE)
      AND (i.effective_until IS NULL OR i.effective_until >= CURRENT_DATE)
  ),
  resolved AS (
    SELECT
      i.id     AS indicator_id,
      i.number,
      i.code,
      i.auto_checks,
      -- Applicabilité : catégorie d'action du dossier, et prestation certifiante.
      ((i.applies_to IS NULL OR (v_action IS NOT NULL AND v_action = ANY (i.applies_to)))
        AND (NOT i.certifying_only OR v_certifying))                  AS applicable,
      COALESCE(orul.stage, srul.stage, 'none')                        AS stage,
      COALESCE(orul.is_blocking, srul.is_blocking, false)             AS is_blocking,
      COALESCE(orul.satisfaction_source, srul.satisfaction_source, 'proof') AS source
    FROM referentiel i
    LEFT JOIN app.qualiopi_indicator_rules srul
      ON srul.indicator_id = i.id AND srul.organization_id IS NULL
     AND srul.is_active AND srul.deleted_at IS NULL
    LEFT JOIN app.qualiopi_indicator_rules orul
      ON orul.indicator_id = i.id AND orul.organization_id = v_org
     AND orul.is_active AND orul.deleted_at IS NULL
  ),
  evaluated AS (
    SELECT
      r.*,
      CASE WHEN NOT r.applicable THEN false ELSE (
        -- Toutes les vérifications automatiques de l'indicateur passent…
        (cardinality(r.auto_checks) > 0 AND NOT EXISTS (
           SELECT 1 FROM unnest(r.auto_checks) AS k
           WHERE NOT COALESCE((v_checks ->> k)::boolean, false)))
        -- …ou une preuve valide est déposée pour ce dossier…
        OR EXISTS (
          SELECT 1 FROM app.qualiopi_proofs p
          WHERE p.dossier_id = p_dossier_id
            -- Une preuve reste valable d'une version à l'autre, au même numéro.
            AND p.indicator_id IN (SELECT x.id FROM app.qualiopi_indicators x
                                   WHERE x.number = r.number AND x.referential_version <> 'legacy')
            AND p.deleted_at IS NULL
            AND (p.valid_from  IS NULL OR p.valid_from  <= CURRENT_DATE)
            AND (p.valid_until IS NULL OR p.valid_until >= CURRENT_DATE))
        -- …ou, pour une règle d'organisme fondée sur une source, celle-ci est remplie.
        OR COALESCE((v_checks ->> CASE r.source::text
             WHEN 'questionnaire_positionnement' THEN 'questionnaire_positionnement'
             WHEN 'questionnaire_evaluation'     THEN 'questionnaire_evaluation_acquis'
             WHEN 'attendance_signed'            THEN 'attendance_finalized'
             WHEN 'document_signed'              THEN 'document_signed'
           END)::boolean, false)
      ) END AS is_satisfied,
      (SELECT COALESCE(jsonb_object_agg(k, COALESCE((v_checks ->> k)::boolean, false)), '{}'::jsonb)
         FROM unnest(r.auto_checks) AS k) AS checks
    FROM resolved r
  )
  SELECT
    count(*) FILTER (WHERE applicable)::int,
    count(*) FILTER (WHERE applicable AND is_satisfied)::int,
    count(*) FILTER (WHERE applicable AND stage = 'entry'   AND is_blocking AND NOT is_satisfied)::int,
    count(*) FILTER (WHERE applicable AND stage = 'closing' AND is_blocking AND NOT is_satisfied)::int,
    count(*) FILTER (WHERE applicable AND is_blocking AND NOT is_satisfied)::int,
    COALESCE(jsonb_agg(jsonb_build_object(
      'indicator_id', indicator_id,
      'number',       number,
      'code',         code,
      'applicable',   applicable,
      -- Un indicateur non applicable ne bloque rien et n'a pas d'étape.
      'stage',        CASE WHEN applicable THEN stage::text ELSE 'none' END,
      'is_blocking',  applicable AND is_blocking,
      'satisfied',    is_satisfied,
      'source',       source,
      'checks',       checks
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
    computed_at              = now(),
    total_indicators         = EXCLUDED.total_indicators,
    satisfied_indicators     = EXCLUDED.satisfied_indicators,
    blocking_missing         = EXCLUDED.blocking_missing,
    entry_blocking_missing   = EXCLUDED.entry_blocking_missing,
    closing_blocking_missing = EXCLUDED.closing_blocking_missing,
    details                  = EXCLUDED.details;
END $$;

UPDATE app.qualiopi_indicators
SET auto_checks = ARRAY['convocation_sent']
WHERE number = 9 AND referential_version IN ('v9', 'v10');

-- ── 2. Recalcul déclenché par l'activité du dossier ─────────────────────────
-- Le dossier doit encore exister : lors de sa suppression, les lignes liées
-- partent en cascade et il n'y a plus rien à recalculer.
CREATE OR REPLACE FUNCTION app.tg_recompute_qualiopi_from_row()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
  v_new UUID;
  v_old UUID;
BEGIN
  IF TG_OP <> 'DELETE' THEN v_new := NEW.dossier_id; END IF;
  IF TG_OP <> 'INSERT' THEN v_old := OLD.dossier_id; END IF;

  IF v_new IS NOT NULL AND EXISTS (SELECT 1 FROM app.dossiers WHERE id = v_new) THEN
    PERFORM app.recompute_qualiopi_checklist(v_new);
  END IF;
  IF v_old IS NOT NULL AND v_old IS DISTINCT FROM v_new
     AND EXISTS (SELECT 1 FROM app.dossiers WHERE id = v_old) THEN
    PERFORM app.recompute_qualiopi_checklist(v_old);
  END IF;
  RETURN NULL;
END $$;

REVOKE ALL ON FUNCTION app.tg_recompute_qualiopi_from_row() FROM PUBLIC;

DROP TRIGGER IF EXISTS tg_questionnaire_assignments_recompute_qualiopi ON app.questionnaire_assignments;
CREATE TRIGGER tg_questionnaire_assignments_recompute_qualiopi
  AFTER INSERT OR DELETE OR UPDATE OF status, dossier_id ON app.questionnaire_assignments
  FOR EACH ROW EXECUTE FUNCTION app.tg_recompute_qualiopi_from_row();

DROP TRIGGER IF EXISTS tg_attendance_sheets_recompute_qualiopi ON app.attendance_sheets;
CREATE TRIGGER tg_attendance_sheets_recompute_qualiopi
  AFTER INSERT OR DELETE OR UPDATE OF status, dossier_id ON app.attendance_sheets
  FOR EACH ROW EXECUTE FUNCTION app.tg_recompute_qualiopi_from_row();

DROP TRIGGER IF EXISTS tg_qualiopi_proofs_recompute_qualiopi ON app.qualiopi_proofs;
CREATE TRIGGER tg_qualiopi_proofs_recompute_qualiopi
  AFTER INSERT OR DELETE OR UPDATE OF deleted_at, valid_from, valid_until, dossier_id ON app.qualiopi_proofs
  FOR EACH ROW EXECUTE FUNCTION app.tg_recompute_qualiopi_from_row();

DROP TRIGGER IF EXISTS tg_email_log_recompute_qualiopi ON app.email_log;
CREATE TRIGGER tg_email_log_recompute_qualiopi
  AFTER INSERT ON app.email_log
  FOR EACH ROW
  WHEN (NEW.dossier_id IS NOT NULL AND NEW.kind LIKE 'convocation%' AND NEW.status = 'sent')
  EXECUTE FUNCTION app.tg_recompute_qualiopi_from_row();

DROP TRIGGER IF EXISTS tg_documents_recompute_qualiopi ON app.documents;
CREATE TRIGGER tg_documents_recompute_qualiopi
  AFTER INSERT OR UPDATE OF deleted_at, kind ON app.documents
  FOR EACH ROW
  WHEN (NEW.dossier_id IS NOT NULL AND NEW.kind = 'convocation')
  EXECUTE FUNCTION app.tg_recompute_qualiopi_from_row();

-- ── 3. Recalcul des dossiers ouverts (convocations déjà journalisées) ───────
SELECT app.recompute_open_qualiopi_checklists();
