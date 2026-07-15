-- ============================================================
-- Fixes à appliquer (Ismael) — idempotent, copier-coller dans
-- Supabase Dashboard > SQL Editor > New query > Run.
-- Contient : 0109 (RPC catalogue public) + 0111/0112/0113
-- (auto-satisfaction Qualiopi) + 0114 (fix transition dossier).
-- ============================================================

-- ─────────────── 0109_public_formation_full_rpc.sql ───────────────
-- ============================================================================
-- 0109 — RPC publique « formation complète » pour la page programme publique
-- ============================================================================
-- La page programme publique (/catalogue/<id>) doit rendre le programme complet
-- d'une formation PUBLIÉE sans session : titre, contenu pédagogique, metadata
-- (dont metadata.catalog.programme = programme personnalisé), et l'identité de
-- l'OF pour le pied de page légal. Les RPC 0071 ne renvoyaient que 7 colonnes.
--
-- Renvoie un jsonb unique (formation + organization imbriquée). SECURITY DEFINER,
-- granted anon : lecture publique bornée aux formations publiées d'un OF actif —
-- aucune fuite (RLS contournée mais filtre is_published + org active en dur).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_published_formation_full(p_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, app, public
AS $$
  SELECT jsonb_build_object(
    'id', f.id,
    'organization_id', f.organization_id,
    'code', f.code,
    'title', f.title,
    'summary', f.summary,
    'description', f.description,
    'objectives', f.objectives,
    'prerequisites', f.prerequisites,
    'target_audience', f.target_audience,
    'evaluation_method', f.evaluation_method,
    'pedagogical_method', f.pedagogical_method,
    'default_modality', f.default_modality::text,
    'default_duration_hours', f.default_duration_hours,
    'default_price_cents', f.default_price_cents,
    'rncp_code', f.rncp_code,
    'rs_code', f.rs_code,
    'certificateur', f.certificateur,
    'metadata', f.metadata,
    'organization', jsonb_build_object(
      'name', o.name,
      'legal_name', o.legal_name,
      'siret', o.siret,
      'naf_code', o.naf_code,
      'declaration_activite', o.declaration_activite,
      'address', o.address,
      'contact_email', o.contact_email,
      'contact_phone', o.contact_phone,
      'logo_path', o.logo_path
    )
  )
  FROM app.formations f
  JOIN app.organizations o ON o.id = f.organization_id
  WHERE f.id = p_id
    AND f.is_published = true
    AND f.deleted_at IS NULL
    AND o.status = 'active'
    AND o.deleted_at IS NULL;
$$;

REVOKE ALL ON FUNCTION public.get_published_formation_full(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_published_formation_full(uuid) TO anon, authenticated;

-- ── Complément d'identité Capsule IA (pied de page légal du programme) ──────
-- 0108 a posé nom/SIRET/adresse ; on complète NDA, NAF, tél et email (bénéficie
-- aussi au cachet auto des documents). Idempotent, même cible que 0108.
UPDATE app.organizations
SET
  naf_code             = COALESCE(naf_code, '8559A'),
  declaration_activite = COALESCE(declaration_activite, '24450461545'),
  contact_phone        = COALESCE(contact_phone, '07 67 93 30 36'),
  contact_email        = COALESCE(contact_email, 'contact@capsule.ia.com'),
  updated_at           = now()
WHERE slug = 'acme-of'
   OR (SELECT count(*) FROM app.organizations) = 1;

-- Rafraîchit le cache de schéma PostgREST (nouvelle fonction visible côté API).
NOTIFY pgrst, 'reload schema';


-- ─────────────── 0111_qualiopi_autosatisfy_programme.sql ───────────────
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


-- ─────────────── 0112_qualiopi_autosatisfy_trainer_eval.sql ───────────────
-- ============================================================================
-- 0112 — Qualiopi : auto-satisfaction I15 (atteinte objectifs) & I21 (formateur)
-- ============================================================================
-- Prolonge 0111 :
--   • I15 (évaluation de l'atteinte des objectifs, clôture) : satisfait quand le
--     questionnaire d'évaluation des acquis est complété — OU preuve attachée.
--   • I21 (compétences des formateurs, entrée) : satisfait quand au moins un
--     formateur est affecté au dossier — OU preuve attachée.
-- + Trigger sur app.dossier_trainers : recalcul de la checklist à l'affectation
--   / retrait d'un formateur → I21 passe au vert automatiquement.
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

-- ── Trigger : recalcul auto à l'affectation / retrait d'un formateur ────────
CREATE OR REPLACE FUNCTION app.tg_dossier_trainers_recompute_qualiopi()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
  PERFORM app.recompute_qualiopi_checklist(COALESCE(NEW.dossier_id, OLD.dossier_id));
  RETURN COALESCE(NEW, OLD);
END $$;

DROP TRIGGER IF EXISTS tg_dossier_trainers_recompute_qualiopi ON app.dossier_trainers;
CREATE TRIGGER tg_dossier_trainers_recompute_qualiopi
  AFTER INSERT OR DELETE ON app.dossier_trainers
  FOR EACH ROW
  EXECUTE FUNCTION app.tg_dossier_trainers_recompute_qualiopi();


-- ─────────────── 0113_qualiopi_autosatisfy_positionnement_satisfaction.sql ───────────────
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


-- ─────────────── 0114_fix_dossier_transition_guard.sql ───────────────
-- ============================================================================
-- 0114 — Fix garde-fou transitions dossier : RLS historique + alignement modèle
-- ============================================================================
-- 1) SECURITY DEFINER : le trigger insère dans app.dossier_status_history, table
--    dont la RLS n'expose qu'une policy SELECT (écriture réservée au trigger).
--    En SECURITY INVOKER, une transition déclenchée par un client utilisateur
--    échouait : « new row violates row-level security policy for table
--    dossier_status_history ». DEFINER = l'insert s'exécute comme propriétaire.
-- 2) CASE aligné sur le modèle "pragmatique" exposé à l'UI (status-transitions.ts) :
--    draft→active (démarrer directement), pending_validation→active, active→closed.
--    La conformité reste garantie par le gate Qualiopi (tg_qualiopi_transition_gate).
-- ============================================================================

CREATE OR REPLACE FUNCTION app.guard_dossier_transitions()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE valid BOOLEAN := false;
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO app.dossier_status_history
      (organization_id, dossier_id, from_status, to_status, triggered_by)
    VALUES
      (NEW.organization_id, NEW.id, NULL, NEW.status, auth.uid());
    RETURN NEW;
  END IF;

  IF NEW.status = OLD.status THEN
    RETURN NEW;
  END IF;

  valid := CASE
    WHEN OLD.status = 'draft'              AND NEW.status IN ('active','pending_validation','cancelled') THEN true
    WHEN OLD.status = 'pending_validation' AND NEW.status IN ('active','scheduled','draft','cancelled') THEN true
    WHEN OLD.status = 'scheduled'          AND NEW.status IN ('active','cancelled') THEN true
    WHEN OLD.status = 'active'             AND NEW.status IN ('completed','closed','cancelled') THEN true
    WHEN OLD.status = 'completed'          AND NEW.status IN ('closed') THEN true
    WHEN OLD.status = 'closed'             AND NEW.status IN ('archived') THEN true
    WHEN OLD.status = 'closed'             AND NEW.status = 'active'
         AND app.current_role() IN ('owner','admin') THEN true
    ELSE false
  END;

  IF NOT valid THEN
    RAISE EXCEPTION 'Invalid dossier transition % -> %', OLD.status, NEW.status;
  END IF;

  INSERT INTO app.dossier_status_history
    (organization_id, dossier_id, from_status, to_status, triggered_by)
  VALUES
    (NEW.organization_id, NEW.id, OLD.status, NEW.status, auth.uid());

  IF NEW.status = 'closed' AND NEW.closed_at IS NULL THEN
    NEW.closed_at := now();
  END IF;
  IF NEW.status = 'cancelled' AND NEW.cancelled_at IS NULL THEN
    NEW.cancelled_at := now();
  END IF;
  RETURN NEW;
END;
$$;


