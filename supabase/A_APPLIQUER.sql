-- ════════════════════════════════════════════════════════════════════════════
-- Capsule IA — migrations à appliquer
--
--   0138  correctif : le déclencheur d'audit faisait échouer la désactivation
--         d'un membre (et toute écriture faite avec la session utilisateur)
--   0139  référentiel Qualiopi officiel : renumérotation RNQ V9, applicabilité,
--         moteur par vérifications, recalcul des check-lists
--   0140  Qualiopi au niveau de l'organisme : statut par indicateur et dépôt
--         de preuves (espace de stockage privé)
--
-- Les trois sont rejouables sans risque. La 0137 est déjà en production.
-- À coller dans l'éditeur SQL Supabase, puis « Run ».
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ───────────── 0138_audit_row_security_definer.sql ─────────────

-- 0138 — Le déclencheur d'audit écrivait sous les droits de l'appelant.
--
-- Constat (audit 2026-09-03, CAP-31) : `audit.audit_row()` était déclarée sans
-- `SECURITY DEFINER`. Elle s'exécutait donc sous le rôle de l'appelant —
-- `authenticated` pour un utilisateur connecté. Or `audit.audit_log` a la RLS
-- activée et forcée (migration 0016) et ne porte qu'une policy **SELECT**
-- (migration 0023) : l'insertion du journal était refusée, l'exception
-- remontait, et **l'écriture d'origine échouait**.
--
-- Le déclencheur est posé sur vingt tables : organizations, members,
-- invitations, companies, learners, formations, modules, dossiers et leurs
-- rattachements, sessions, attendance_sheets, attendance_signatures, documents,
-- document_signatures, qualiopi_proofs, complaints, invoices, payments.
--
-- Toute écriture faite avec la session de l'utilisateur sur l'une d'elles était
-- donc vouée à l'échec. Le défaut est resté invisible parce que la quasi-totalité
-- des écritures de l'application passent par le service role, qui contourne la
-- RLS. Il se manifestait sur les rares actions passant par `authActionClient` —
-- au premier rang desquelles la désactivation d'un membre, dont l'échec était
-- rapporté sans motif.
--
-- Un journal d'audit doit précisément être alimentable par le déclencheur sans
-- l'être directement par l'utilisateur : c'est le rôle de `SECURITY DEFINER`.
-- Le corps de la fonction est repris à l'identique de la migration 0015.

CREATE OR REPLACE FUNCTION audit.audit_row()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = audit, app, public
AS $$
DECLARE
  v_org UUID;
  v_row_id UUID;
BEGIN
  BEGIN
    EXECUTE format('SELECT ($1).organization_id') INTO v_org USING NEW;
  EXCEPTION WHEN undefined_column THEN
    v_org := NULL;
  END;
  IF v_org IS NULL AND TG_OP <> 'DELETE' THEN
    BEGIN
      EXECUTE format('SELECT ($1).organization_id') INTO v_org USING OLD;
    EXCEPTION WHEN undefined_column THEN
      v_org := NULL;
    END;
  END IF;

  IF TG_OP = 'DELETE' THEN
    v_row_id := (OLD.id);
    INSERT INTO audit.audit_log
      (organization_id, actor_user_id, actor_ip, actor_user_agent,
       schema_name, table_name, row_id, action, before, after, diff)
    VALUES
      (v_org, auth.uid(), app.current_actor_ip(), app.current_actor_user_agent(),
       TG_TABLE_SCHEMA, TG_TABLE_NAME, v_row_id, 'delete',
       to_jsonb(OLD), NULL, NULL);
    RETURN OLD;
  ELSIF TG_OP = 'UPDATE' THEN
    v_row_id := (NEW.id);
    INSERT INTO audit.audit_log
      (organization_id, actor_user_id, actor_ip, actor_user_agent,
       schema_name, table_name, row_id, action, before, after, diff)
    VALUES
      (v_org, auth.uid(), app.current_actor_ip(), app.current_actor_user_agent(),
       TG_TABLE_SCHEMA, TG_TABLE_NAME, v_row_id, 'update',
       to_jsonb(OLD), to_jsonb(NEW),
       (SELECT jsonb_object_agg(key, value)
          FROM jsonb_each(to_jsonb(NEW))
         WHERE to_jsonb(OLD) -> key IS DISTINCT FROM value));
    RETURN NEW;
  ELSIF TG_OP = 'INSERT' THEN
    v_row_id := (NEW.id);
    INSERT INTO audit.audit_log
      (organization_id, actor_user_id, actor_ip, actor_user_agent,
       schema_name, table_name, row_id, action, before, after, diff)
    VALUES
      (v_org, auth.uid(), app.current_actor_ip(), app.current_actor_user_agent(),
       TG_TABLE_SCHEMA, TG_TABLE_NAME, v_row_id, 'insert',
       NULL, to_jsonb(NEW), NULL);
    RETURN NEW;
  END IF;
  RETURN NULL;
END;
$$;

COMMENT ON FUNCTION audit.audit_row() IS
  'Journalise INSERT/UPDATE/DELETE dans audit.audit_log. SECURITY DEFINER : le journal est alimentable par le déclencheur, jamais directement par l''utilisateur (audit CAP-31).';

-- ───────────── 0139_qualiopi_referentiel_officiel.sql ─────────────

-- 0139 — Référentiel Qualiopi officiel (RNQ, guide de lecture V9) et moteur
--        d'évaluation par vérifications.
--
-- Constat (audit 2026-09-11, CAP-35) : le référentiel semé en base ne suivait
-- pas la numérotation officielle. Capsule affichait par exemple « Indicateur 23 :
-- Évaluation des acquis », alors que l'indicateur 23 du RNQ est la veille légale
-- et réglementaire ; le positionnement était rangé en 10 au lieu de 8, les
-- compétences des intervenants en critère 6 au lieu de 5. Devant un auditeur,
-- ces libellés étaient faux.
--
-- Ce que fait cette migration :
--
-- 1. Le référentiel devient VERSIONNÉ. Le RNQ passe à 33 indicateurs le
--    1er novembre 2026 (décret n° 2026-728) : les versions coexisteront, chacune
--    bornée par ses dates d'effet, au lieu d'une liste figée à réécrire.
-- 2. L'ancien jeu (« legacy ») est désactivé, pas supprimé : il reste lisible et
--    rien ne le référence plus. Aucune preuve n'y était rattachée (0 en
--    production au 2026-09-11).
-- 3. Les 32 indicateurs V9 sont semés avec leur numéro, leur critère, leur
--    applicabilité (catégories d'action, prestations certifiantes, condition),
--    le traitement « nouvel entrant » et la gravité possible de l'écart.
-- 4. Le moteur n'évalue plus des numéros codés en dur mais des VÉRIFICATIONS
--    nommées (« questionnaire de positionnement complété », « émargements
--    finalisés »…), rattachées aux indicateurs par la colonne `auto_checks`.
--    Renuméroter ou changer de version devient une affaire de données.
-- 5. Un indicateur qui ne s'applique pas au dossier (réservé à l'apprentissage,
--    aux formations certifiantes…) sort du décompte au lieu d'y figurer comme
--    manquant.
-- 6. Toutes les check-lists de dossier sont recalculées.
--
-- Le comportement de clôture est conservé : un dossier ne se clôture pas tant
-- que l'évaluation des acquis n'est pas recueillie et que les émargements ne
-- sont pas finalisés — désormais sous leurs numéros officiels 11 et 12.

-- ── 1. Colonnes du référentiel versionné ─────────────────────────────────────
ALTER TABLE app.qualiopi_indicators
  ADD COLUMN IF NOT EXISTS referential_version TEXT NOT NULL DEFAULT 'legacy',
  ADD COLUMN IF NOT EXISTS criterion_label   TEXT,
  ADD COLUMN IF NOT EXISTS requirement       TEXT,
  -- NULL = toutes les catégories d'action ; sinon valeurs de dossier_action_type.
  ADD COLUMN IF NOT EXISTS applies_to        TEXT[],
  ADD COLUMN IF NOT EXISTS certifying_only   BOOLEAN NOT NULL DEFAULT false,
  -- Condition d'organisme : 'subcontracting' (recours à la sous-traitance ou au
  -- portage), 'work_periods' (périodes en situation de travail).
  ADD COLUMN IF NOT EXISTS condition         TEXT,
  ADD COLUMN IF NOT EXISTS new_entrant       BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS minor_nc_possible BOOLEAN NOT NULL DEFAULT false,
  -- Vérifications automatiques : l'indicateur est satisfait si TOUTES passent
  -- (ou si une preuve valide est déposée).
  ADD COLUMN IF NOT EXISTS auto_checks       TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS effective_from    DATE,
  ADD COLUMN IF NOT EXISTS effective_until   DATE;

-- Le numéro n'est plus unique à lui seul (V9 et V10 partagent 1 à 32), et le
-- référentiel V10 compte 33 indicateurs. On retire toute contrainte portant sur
-- la seule colonne `number`, quel que soit son nom.
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT con.conname
    FROM pg_constraint con
    JOIN pg_attribute att
      ON att.attrelid = con.conrelid AND att.attnum = ANY (con.conkey)
    WHERE con.conrelid = 'app.qualiopi_indicators'::regclass
      AND con.contype IN ('u', 'c')
      AND att.attname = 'number'
      AND cardinality(con.conkey) = 1
  LOOP
    EXECUTE format('ALTER TABLE app.qualiopi_indicators DROP CONSTRAINT %I', r.conname);
  END LOOP;
END $$;

ALTER TABLE app.qualiopi_indicators
  ADD CONSTRAINT qualiopi_indicators_number_check CHECK (number BETWEEN 1 AND 33);

CREATE UNIQUE INDEX IF NOT EXISTS ux_qualiopi_indicators_version_number
  ON app.qualiopi_indicators (referential_version, number);

-- ── 2. Désactivation de l'ancien jeu ────────────────────────────────────────
UPDATE app.qualiopi_indicators
SET is_active = false
WHERE referential_version = 'legacy' AND is_active;

UPDATE app.qualiopi_indicator_rules r
SET is_active = false, updated_at = now()
FROM app.qualiopi_indicators i
WHERE r.indicator_id = i.id AND i.referential_version = 'legacy' AND r.is_active;

-- ── 3. Référentiel national qualité — guide de lecture V9 (8 janvier 2024) ──
INSERT INTO app.qualiopi_indicators
  (code, number, scope, criterion, criterion_label, title, referential_version,
   applies_to, certifying_only, condition, new_entrant, minor_nc_possible,
   auto_checks, is_active)
VALUES
  ('V9-I1',  1, 'organization', 1, 'Information du public', 'Information accessible, détaillée et vérifiable sur les prestations', 'v9', NULL, false, NULL, false, true, '{}', true),
  ('V9-I2',  2, 'organization', 1, 'Information du public', 'Indicateurs de résultats adaptés à la nature des prestations', 'v9', NULL, false, NULL, true,  true, '{}', true),
  ('V9-I3',  3, 'organization', 1, 'Information du public', 'Taux d''obtention des certifications, blocs, équivalences, passerelles, débouchés', 'v9', NULL, true,  NULL, true,  true, '{}', true),

  ('V9-I4',  4, 'dossier', 2, 'Objectifs et adaptation des prestations', 'Analyse du besoin du bénéficiaire', 'v9', NULL, false, NULL, false, false, '{questionnaire_positionnement}', true),
  ('V9-I5',  5, 'dossier', 2, 'Objectifs et adaptation des prestations', 'Objectifs opérationnels et évaluables', 'v9', NULL, false, NULL, false, false, '{formation_objectives,formation_evaluation_method}', true),
  ('V9-I6',  6, 'dossier', 2, 'Objectifs et adaptation des prestations', 'Contenus et modalités adaptés aux objectifs et aux publics', 'v9', NULL, false, NULL, false, false, '{formation_programme,formation_pedagogy}', true),
  ('V9-I7',  7, 'dossier', 2, 'Objectifs et adaptation des prestations', 'Adéquation des contenus aux exigences de la certification visée', 'v9', NULL, true,  NULL, false, false, '{}', true),
  ('V9-I8',  8, 'dossier', 2, 'Objectifs et adaptation des prestations', 'Positionnement et évaluation des acquis à l''entrée', 'v9', NULL, false, NULL, false, true, '{questionnaire_positionnement}', true),

  ('V9-I9',  9, 'dossier', 3, 'Accueil, accompagnement, suivi et évaluation', 'Information sur les conditions de déroulement de la prestation', 'v9', NULL, false, NULL, false, true, '{}', true),
  ('V9-I10', 10, 'dossier', 3, 'Accueil, accompagnement, suivi et évaluation', 'Adaptation de la prestation, de l''accompagnement et du suivi', 'v9', NULL, false, NULL, false, false, '{}', true),
  ('V9-I11', 11, 'dossier', 3, 'Accueil, accompagnement, suivi et évaluation', 'Évaluation de l''atteinte des objectifs par les bénéficiaires', 'v9', NULL, false, NULL, true,  false, '{questionnaire_evaluation_acquis}', true),
  ('V9-I12', 12, 'dossier', 3, 'Accueil, accompagnement, suivi et évaluation', 'Engagement des bénéficiaires et prévention des ruptures de parcours', 'v9', NULL, false, NULL, false, true, '{attendance_finalized}', true),
  ('V9-I13', 13, 'dossier', 3, 'Accueil, accompagnement, suivi et évaluation', 'Coordination entre le centre de formation et l''entreprise (alternance)', 'v9', '{apprentissage}', false, NULL, true,  true, '{}', true),
  ('V9-I14', 14, 'dossier', 3, 'Accueil, accompagnement, suivi et évaluation', 'Accompagnement socio-professionnel, éducatif et exercice de la citoyenneté', 'v9', '{apprentissage}', false, NULL, true,  false, '{}', true),
  ('V9-I15', 15, 'dossier', 3, 'Accueil, accompagnement, suivi et évaluation', 'Droits et devoirs de l''apprenti, santé et sécurité au travail', 'v9', '{apprentissage}', false, NULL, false, false, '{}', true),
  ('V9-I16', 16, 'dossier', 3, 'Accueil, accompagnement, suivi et évaluation', 'Conditions de présentation à la certification', 'v9', NULL, true,  NULL, false, false, '{}', true),

  ('V9-I17', 17, 'organization', 4, 'Moyens pédagogiques, techniques et d''encadrement', 'Moyens humains et techniques, locaux et équipements adaptés', 'v9', NULL, false, NULL, false, true, '{}', true),
  ('V9-I18', 18, 'organization', 4, 'Moyens pédagogiques, techniques et d''encadrement', 'Coordination des intervenants internes et externes', 'v9', NULL, false, NULL, false, true, '{}', true),
  ('V9-I19', 19, 'organization', 4, 'Moyens pédagogiques, techniques et d''encadrement', 'Ressources pédagogiques mises à disposition et leur appropriation', 'v9', NULL, false, NULL, true,  true, '{}', true),
  ('V9-I20', 20, 'organization', 4, 'Moyens pédagogiques, techniques et d''encadrement', 'Référents mobilité et handicap, conseil de perfectionnement (CFA)', 'v9', '{apprentissage}', false, NULL, false, false, '{}', true),

  ('V9-I21', 21, 'dossier', 5, 'Qualification et développement des compétences des personnels', 'Compétences des intervenants : détermination, mobilisation, évaluation', 'v9', NULL, false, NULL, false, false, '{trainer_assigned}', true),
  ('V9-I22', 22, 'organization', 5, 'Qualification et développement des compétences des personnels', 'Développement des compétences des salariés', 'v9', NULL, false, NULL, true,  false, '{}', true),

  ('V9-I23', 23, 'organization', 6, 'Inscription dans l''environnement professionnel', 'Veille légale et réglementaire', 'v9', NULL, false, NULL, false, true, '{}', true),
  ('V9-I24', 24, 'organization', 6, 'Inscription dans l''environnement professionnel', 'Veille sur les emplois, les métiers et les compétences', 'v9', NULL, false, NULL, true,  true, '{}', true),
  ('V9-I25', 25, 'organization', 6, 'Inscription dans l''environnement professionnel', 'Veille sur les innovations pédagogiques et technologiques', 'v9', NULL, false, NULL, true,  true, '{}', true),
  ('V9-I26', 26, 'organization', 6, 'Inscription dans l''environnement professionnel', 'Mobilisation des expertises et réseaux sur le handicap', 'v9', NULL, false, NULL, true,  false, '{}', true),
  ('V9-I27', 27, 'organization', 6, 'Inscription dans l''environnement professionnel', 'Conformité de la sous-traitance et du portage salarial', 'v9', NULL, false, 'subcontracting', false, false, '{}', true),
  ('V9-I28', 28, 'organization', 6, 'Inscription dans l''environnement professionnel', 'Réseau de partenaires pour les périodes en situation de travail', 'v9', NULL, false, 'work_periods', false, true, '{}', true),
  ('V9-I29', 29, 'organization', 6, 'Inscription dans l''environnement professionnel', 'Insertion professionnelle et poursuite d''études', 'v9', '{apprentissage}', false, NULL, false, false, '{}', true),

  ('V9-I30', 30, 'dossier', 7, 'Appréciations et réclamations', 'Recueil des appréciations des parties prenantes', 'v9', NULL, false, NULL, false, true, '{satisfaction_chaud}', true),
  ('V9-I31', 31, 'organization', 7, 'Appréciations et réclamations', 'Traitement des difficultés, réclamations et aléas', 'v9', NULL, false, NULL, false, false, '{}', true),
  ('V9-I32', 32, 'organization', 7, 'Appréciations et réclamations', 'Mesures d''amélioration à partir des appréciations et réclamations', 'v9', NULL, false, NULL, true,  false, '{}', true)
ON CONFLICT (code) DO NOTHING;

-- ── 4. Règles système des indicateurs de niveau dossier ─────────────────────
-- Étape et caractère bloquant repris de l'ancien jeu, sous les numéros
-- officiels. `ON CONFLICT` ne protège pas ici (organization_id NULL : les NULL
-- sont distincts pour une contrainte d'unicité), d'où le NOT EXISTS qui rend la
-- migration rejouable.
INSERT INTO app.qualiopi_indicator_rules
  (organization_id, indicator_id, stage, is_blocking, satisfaction_source)
SELECT NULL, i.id, v.stage::app.qualiopi_gate_stage, v.blocking,
       'proof'::app.qualiopi_satisfaction_source
FROM (VALUES
  (4,  'entry',   true),
  (5,  'entry',   true),
  (6,  'entry',   true),
  (7,  'entry',   false),
  (8,  'entry',   true),
  (9,  'entry',   false),
  (10, 'none',    false),
  (11, 'closing', true),
  (12, 'closing', true),
  (13, 'entry',   false),
  (14, 'none',    false),
  (15, 'none',    false),
  (16, 'closing', false),
  (21, 'entry',   true),
  (30, 'closing', false)
) AS v(num, stage, blocking)
JOIN app.qualiopi_indicators i
  ON i.number = v.num AND i.referential_version = 'v9'
WHERE NOT EXISTS (
  SELECT 1 FROM app.qualiopi_indicator_rules x
  WHERE x.organization_id IS NULL AND x.indicator_id = i.id
);

-- ── 5. Moteur d'évaluation ──────────────────────────────────────────────────
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
      -- Une catégorie inconnue ne rend PAS applicable un indicateur réservé
      -- (apprentissage…) : le dossier est alors traité comme une formation.
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
          WHERE p.dossier_id = p_dossier_id AND p.indicator_id = r.indicator_id
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

-- ── 6. Recalcul de toutes les check-lists ───────────────────────────────────
DO $$
DECLARE d RECORD;
BEGIN
  FOR d IN SELECT id FROM app.dossiers WHERE deleted_at IS NULL LOOP
    PERFORM app.recompute_qualiopi_checklist(d.id);
  END LOOP;
END $$;

COMMENT ON COLUMN app.qualiopi_indicators.auto_checks IS
  'Vérifications automatiques ; l''indicateur est satisfait si toutes passent, ou si une preuve valide est déposée (audit CAP-35).';
COMMENT ON COLUMN app.qualiopi_indicators.referential_version IS
  'Version du RNQ : legacy (ancien jeu, désactivé), v9 (guide de lecture du 8 janvier 2024), v10 à venir (33 indicateurs au 1er novembre 2026).';

NOTIFY pgrst, 'reload schema';

-- ───────────── 0140_qualiopi_organisme.sql ─────────────

-- 0140 — Qualiopi au niveau de l'organisme : statut par indicateur et preuves.
--
-- Constat (audit 2026-09-11, CAP-36) : sur les 32 indicateurs, 17 relèvent de
-- l'organisme et non d'un dossier (information du public, moyens, veille,
-- réclamations, amélioration continue…). Aucun n'était évalué ni suivi, et
-- aucune preuve ne pouvait être déposée : la table `qualiopi_proofs` existait,
-- mais rien dans l'application ne l'alimentait.
--
-- Sur le modèle de l'auto-évaluation de Digiforma — une validation par
-- indicateur —, enrichi de ce qui lui manque : les preuves elles-mêmes.
--
-- 1. `qualiopi_org_indicator_status` : où en est l'organisme sur chaque
--    indicateur (à traiter, en cours, conforme, non applicable), avec une note.
--    Pas de suppression : on change de statut, on ne l'efface pas.
-- 2. Seau de stockage privé `qualiopi-proofs` pour les pièces déposées :
--    PDF, images, documents bureautiques. Chemin : {organisation}/I{numéro}/…,
--    lecture et écriture bornées à l'organisation courante (idiome de 0133).

-- ── 1. Statut par indicateur ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS app.qualiopi_org_indicator_status (
  id              UUID PRIMARY KEY DEFAULT uuidv7(),
  organization_id UUID NOT NULL REFERENCES app.organizations(id) ON DELETE CASCADE,
  indicator_id    UUID NOT NULL REFERENCES app.qualiopi_indicators(id) ON DELETE CASCADE,
  status          TEXT NOT NULL DEFAULT 'a_traiter'
                  CHECK (status IN ('a_traiter', 'en_cours', 'conforme', 'non_applicable')),
  note            TEXT CHECK (note IS NULL OR length(note) <= 2000),
  updated_by      UUID REFERENCES app.members(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, indicator_id)
);

CREATE INDEX IF NOT EXISTS ix_qualiopi_org_status_org
  ON app.qualiopi_org_indicator_status (organization_id);

ALTER TABLE app.qualiopi_org_indicator_status ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.qualiopi_org_indicator_status FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS qualiopi_org_status_select ON app.qualiopi_org_indicator_status;
CREATE POLICY qualiopi_org_status_select ON app.qualiopi_org_indicator_status
  FOR SELECT TO authenticated
  USING (organization_id = app.current_organization_id());

DROP POLICY IF EXISTS qualiopi_org_status_insert ON app.qualiopi_org_indicator_status;
CREATE POLICY qualiopi_org_status_insert ON app.qualiopi_org_indicator_status
  FOR INSERT TO authenticated
  WITH CHECK (organization_id = app.current_organization_id() AND app.is_staff());

DROP POLICY IF EXISTS qualiopi_org_status_update ON app.qualiopi_org_indicator_status;
CREATE POLICY qualiopi_org_status_update ON app.qualiopi_org_indicator_status
  FOR UPDATE TO authenticated
  USING (organization_id = app.current_organization_id() AND app.is_staff())
  WITH CHECK (organization_id = app.current_organization_id() AND app.is_staff());

COMMENT ON TABLE app.qualiopi_org_indicator_status IS
  'Auto-évaluation de l''organisme par indicateur Qualiopi : statut et note (audit CAP-36).';

-- ── 2. Seau des preuves ─────────────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'qualiopi-proofs',
  'qualiopi-proofs',
  false,
  20971520, -- 20 Mo
  ARRAY[
    'application/pdf',
    'image/png', 'image/jpeg', 'image/webp',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain'
  ]
)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "qualiopi_proofs_read" ON storage.objects;
CREATE POLICY "qualiopi_proofs_read"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'qualiopi-proofs'
    AND (storage.foldername(name))[1] = app.current_organization_id()::text
  );

DROP POLICY IF EXISTS "qualiopi_proofs_insert" ON storage.objects;
CREATE POLICY "qualiopi_proofs_insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'qualiopi-proofs'
    AND (storage.foldername(name))[1] = app.current_organization_id()::text
    AND app.is_staff()
  );

DROP POLICY IF EXISTS "qualiopi_proofs_delete" ON storage.objects;
CREATE POLICY "qualiopi_proofs_delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'qualiopi-proofs'
    AND (storage.foldername(name))[1] = app.current_organization_id()::text
    AND app.is_staff()
  );

NOTIFY pgrst, 'reload schema';

COMMIT;
