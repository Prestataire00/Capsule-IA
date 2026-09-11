-- ════════════════════════════════════════════════════════════════════════════
-- Capsule IA — migrations à appliquer
--
--   0138  correctif : le déclencheur d'audit faisait échouer la désactivation
--         d'un membre (et toute écriture faite avec la session utilisateur)
--   0139  référentiel Qualiopi officiel : renumérotation RNQ V9, applicabilité,
--         moteur par vérifications, recalcul des check-lists
--   0140  Qualiopi au niveau de l'organisme : statut par indicateur et dépôt
--         de preuves (espace de stockage privé)
--   0141  Qualiopi : texte officiel de chaque indicateur, exemples de preuves,
--         applicabilité par catégorie (formation, bilan, VAE, apprentissage)
--   0142  Qualiopi : référentiel V10 (33 indicateurs) au 1er novembre 2026,
--         bascule automatique, recalcul nocturne des dossiers ouverts
--   0143  Qualiopi : conformité recalculée dès qu'un questionnaire est complété,
--         un émargement finalisé, une preuve ou une convocation ajoutée
--   0144  amélioration continue : incidents, axes d'amélioration (à adresser,
--         en cours, optimisé), actions correctives reliées
--   0145  émargement : signature réparée, entrée + sortie, retards, absences
--         (motif), marquage par l'équipe, fenêtre horaire, sessions de groupe
--   0146  émargement : heures réellement suivies (retards, départs déduits),
--         recalcul immédiat, effacement RGPD permis après clôture, verrous réparés
--
-- Toutes sont rejouables sans risque. La 0137 est déjà en production.
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

-- ───────────── 0141_qualiopi_textes_officiels.sql ─────────────

-- 0141 — Qualiopi : textes officiels du référentiel national qualité (RNQ V9)
--
-- 0139 a posé la numérotation officielle, sans le texte des indicateurs : la
-- page qualité affichait un emplacement vide. On renseigne ici, pour les 32
-- indicateurs V9 :
--  · l'exigence officielle, telle que publiée en annexe du décret n° 2019-565
--    du 6 juin 2019 (JORF n° 0132 du 8 juin 2019) ;
--  · des exemples de preuves, repris du guide de lecture V9 (DGEFP, 8 janvier 2024) ;
--  · l'applicabilité par catégorie d'action (L. 6313-1, 1° à 4°), lue dans le
--    tableau de l'annexe : 28 indicateurs pour la formation, 22 pour le bilan
--    de compétences, 24 pour la VAE, 32 pour l'apprentissage.
--
-- Catégories Capsule : formation = action_formation, formation_continue,
-- formation_initiale ; bilan = bilan_competences ; vae ; apprentissage.
-- Un dossier sans catégorie est traité comme une action de formation (il
-- l'était déjà de fait : tous les indicateurs communs s'y appliquaient).
--
-- Indicateur 12 : le guide V9 le réserve aux formations de plus de 2 jours,
-- le tableau officiel l'applique aux quatre catégories — on suit le tableau.
-- Indicateur 13 (alternance) : réservé à l'apprentissage, faute de distinguer
-- les contrats de professionnalisation dans Capsule.
--
-- Rejouable : simples UPDATE sur les lignes V9, puis recalcul des check-lists.

-- ── 1. Textes, preuves et applicabilité ─────────────────────────────────────
UPDATE app.qualiopi_indicators i
SET requirement       = v.requirement,
    expected_proofs   = v.expected_proofs,
    applies_to        = v.applies_to,
    certifying_only   = v.certifying_only,
    new_entrant       = v.new_entrant,
    minor_nc_possible = v.minor_nc_possible
FROM (VALUES
  (1, 'Le prestataire diffuse une information accessible au public, détaillée et vérifiable sur les prestations proposées : prérequis, objectifs, durée, modalités et délais d''accès, tarifs, contacts, méthodes mobilisées et modalités d''évaluation, accessibilité aux personnes handicapées.',
   ARRAY['Tous supports et outils d''information (plaquette, réseaux sociaux, sites internet, supports de publicité, salons)', 'Supports de contractualisation, conditions générales de vente', 'Pour les PSH : supports de présentation de la politique d''accessibilité, conditions d''accès', 'CBC : tout support rappelant le cadre légal et réglementaire du bilan, ses objectifs, son financement']::text[],
   NULL, false, false, true),
  (2, 'Le prestataire diffuse des indicateurs de résultats adaptés à la nature des prestations mises en œuvre et des publics accueillis.',
   ARRAY['Rapports d''activités, bilans, résultats d''enquêtes, indicateurs de performance', 'Indicateurs par formation : taux de satisfaction, nombre de stagiaires, taux et causes des abandons, taux d''insertion dans l''emploi', 'CFA : indicateurs de l''article L. 6111-8 (diffusion InserJeunes)', 'VAE : nombre de candidats accompagnés, taux de réussite']::text[],
   NULL, false, true, true),
  (3, 'Lorsque le prestataire met en œuvre des prestations conduisant à une certification professionnelle, il informe sur les taux d''obtention des certifications préparées, les possibilités de valider un/ou des blocs de compétences, ainsi que sur les équivalences, passerelles, suites de parcours et les débouchés.',
   ARRAY['Supports d''information (plaquette, réseaux sociaux, site internet, supports de contractualisation)', 'Taux d''obtention de la certification (mis en relation avec le taux de présentation à l''examen)', 'Trajectoires d''évolution des bénéficiaires à l''issue de la prestation', 'Information sur les débouchés : taux d''insertion global et dans le métier visé (fiche RNCP)']::text[],
   ARRAY['action_formation', 'formation_continue', 'formation_initiale', 'vae', 'apprentissage']::text[], true, true, true),
  (4, 'Le prestataire analyse le besoin du bénéficiaire en lien avec l''entreprise et/ou le financeur concerné(s).',
   ARRAY['Grilles d''analyse, diagnostics préalables', 'Dossiers d''admission, comptes rendus d''entretiens', 'Critères de détermination de l''opportunité et de la faisabilité de la prestation', 'VAE : contractualisation de l''accompagnement (méthode, modalités, échéancier)']::text[],
   NULL, false, false, false),
  (5, 'Le prestataire définit les objectifs opérationnels et évaluables de la prestation.',
   ARRAY['Identification des compétences visées par la prestation', 'Objectifs pédagogiques intermédiaires et finaux', 'Indicateurs de suivi et de résultats, supports de contractualisation', 'Référentiel de la certification', 'VAE : fiches de travail, programme de travail avec durées prévues']::text[],
   NULL, false, false, false),
  (6, 'Le prestataire établit les contenus et les modalités de mise en œuvre de la prestation, adaptés aux objectifs définis et aux publics bénéficiaires.',
   ARRAY['Parcours, déroulés et séquences', 'Grilles et modalités d''évaluation', 'Modalités techniques et pédagogiques (présentiel, distance, mixte)', 'Guide pratique du déroulé de la prestation avec durée et calendrier', 'PSH : accessibilité ou possibilités d''adaptation des modalités']::text[],
   NULL, false, false, false),
  (7, 'Lorsque le prestataire met en œuvre des prestations conduisant à une certification professionnelle, il s''assure de l''adéquation du ou des contenus de la prestation aux exigences de la certification visée.',
   ARRAY['Offre de formation présentée en cohérence avec le référentiel de la certification', 'Habilitation à former ou convention de partenariat avec le certificateur', 'Tableau croisé contenu de la formation / référentiel de compétences']::text[],
   ARRAY['action_formation', 'formation_continue', 'formation_initiale', 'apprentissage']::text[], true, false, false),
  (8, 'Le prestataire détermine les procédures de positionnement et d''évaluation des acquis à l''entrée de la prestation.',
   ARRAY['Diagnostic préalable, entretien', 'Évaluation des acquis à l''entrée (quiz, QCM, exercices, mise en situation, test)', 'Outils de mesure des écarts de compétences, auto-positionnement', 'Procédures de positionnement et/ou conditions d''accès']::text[],
   ARRAY['action_formation', 'formation_continue', 'formation_initiale', 'apprentissage']::text[], false, false, true),
  (9, 'Le prestataire informe les publics bénéficiaires sur les conditions de déroulement de la prestation.',
   ARRAY['Règlement intérieur, livret d''accueil, convocation', 'Noms des référents pédagogiques et administratifs, organigramme', 'Aspects périphériques (hébergement, restauration, transport, rémunération)', 'FOAD : modalités d''accès au LMS, assistance technique et pédagogique']::text[],
   NULL, false, false, true),
  (10, 'Le prestataire met en œuvre et adapte la prestation, l''accompagnement et le suivi aux publics bénéficiaires.',
   ARRAY['Durées et contenus, emplois du temps, groupes de niveaux', 'Livret de suivi pédagogique (centre/entreprise), référent pédagogique', 'Traçabilité de l''accompagnement technique et pédagogique', 'PSH : plans individuels de compensation du handicap, structures ressources', 'CFA : accompagnement dans la recherche d''un employeur']::text[],
   NULL, false, false, false),
  (11, 'Le prestataire évalue l''atteinte par les publics bénéficiaires des objectifs de la prestation.',
   ARRAY['Outils d''évaluation des acquis en cours et en fin de prestation (à chaud et à froid)', 'Outils d''auto-évaluation, bilans intermédiaires, comptes rendus', 'Taux de réussite aux certifications, preuve de délivrance de la certification', 'Livret de compétences, livrets de suivi en entreprise', 'VAE : dossier de suivi du candidat']::text[],
   NULL, false, true, false),
  (12, 'Le prestataire décrit et met en œuvre les mesures pour favoriser l''engagement des bénéficiaires et prévenir les ruptures de parcours.',
   ARRAY['Procédure de gestion des abandons et de relance systématique', 'Listing de relances téléphoniques, carnet de rendez-vous', 'Outils et méthodes favorisant l''implication (documents co-construits, espaces partagés)', 'Alternance : contacts/visites avec l''entreprise, rencontres formateurs/tuteurs/maîtres d''apprentissage']::text[],
   NULL, false, false, true),
  (13, 'Pour les formations en alternance, le prestataire, en lien avec l''entreprise, anticipe avec l''apprenant les missions confiées, à court, moyen et long terme, et assure la coordination et la progressivité des apprentissages réalisés en centre de formation et en entreprise.',
   ARRAY['Outil de liaison entreprise/bénéficiaire/prestataire (carnet de suivi)', 'Preuves de dialogue entre prestataire et tuteurs', 'Plannings, comptes rendus d''entretien ou de visite d''entreprise', 'Tableau de bord dématérialisé, capitalisation des retours d''expérience', 'PSH : outil de liaison sur les adaptations en entreprise']::text[],
   ARRAY['apprentissage']::text[], false, true, true),
  (14, 'Le prestataire met en œuvre un accompagnement socio-professionnel, éducatif et relatif à l''exercice de la citoyenneté.',
   ARRAY['Projets d''activités sportives, ateliers culturels, éducation aux écrans et à la citoyenneté', 'Dispositifs d''aides financières', 'Liste des intervenants sociaux', 'Accompagnement des apprenants dans le centre (restauration, foyer, internat)', 'Actions de sensibilisation à la mixité et à la diversité']::text[],
   ARRAY['apprentissage']::text[], false, true, false),
  (15, 'Le prestataire informe les apprentis de leurs droits et devoirs en tant qu''apprentis et salariés ainsi que des règles applicables en matière de santé et de sécurité en milieu professionnel.',
   ARRAY['Règlement intérieur du CFA', 'Supports d''information, livret d''accueil', 'Supports de contractualisation', 'Comptes rendus de réunions d''informations collectives']::text[],
   ARRAY['apprentissage']::text[], false, false, false),
  (16, 'Lorsque le prestataire met en œuvre des formations conduisant à une certification professionnelle, il s''assure que les conditions de présentation des bénéficiaires à la certification respectent les exigences formelles de l''autorité de certification.',
   ARRAY['Information des bénéficiaires sur le déroulement de l''évaluation, preuve d''inscription à la session', 'Habilitation à évaluer, convention de partenariat avec le certificateur', 'Référentiel d''évaluation, règlement d''organisation des examens, PV des sessions', 'PSH : modalités d''aménagement des examens']::text[],
   ARRAY['action_formation', 'formation_continue', 'formation_initiale', 'vae', 'apprentissage']::text[], true, false, false),
  (17, 'Le prestataire met à disposition ou s''assure de la mise à disposition des moyens humains et techniques adaptés et d''un environnement approprié (conditions, locaux, équipements, plateaux techniques…).',
   ARRAY['Bail ou contrat de location, registre public d''accessibilité', 'Document unique d''évaluation des risques professionnels', 'Matériel adéquat, plateaux techniques, plateformes LMS', 'CV, planning d''intervention, contrats de sous-traitance ou de prestations']::text[],
   NULL, false, false, true),
  (18, 'Le prestataire mobilise et coordonne les différents intervenants internes et/ou externes (pédagogiques, administratifs, logistiques, commerciaux…).',
   ARRAY['Organigramme fonctionnel avec champs d''intervention', 'Liste des intervenants internes/externes, contrats de travail ou de prestation', 'Fiches de poste, liste des référents pédagogiques, administratifs et handicap', 'Planning des intervenants, comptes rendus de réunions d''équipes']::text[],
   NULL, false, false, true),
  (19, 'Le prestataire met à disposition du bénéficiaire des ressources pédagogiques et permet à celui-ci de se les approprier.',
   ARRAY['Supports de cours, vidéos, fiches pratiques', 'Liste des ressources documentaires (fiches RNCP…)', 'Modalités d''accès aux ressources (présentiel, distance, espace partagé)', 'Traçabilité de l''accompagnement pédagogique à distance (forum, mails)', 'Dispositif de veille et d''actualisation des ressources']::text[],
   NULL, false, true, true),
  (20, 'Le prestataire dispose d''un personnel dédié à l''appui à la mobilité nationale et internationale, d''un référent handicap et d''un conseil de perfectionnement.',
   ARRAY['Nom et qualité des membres du conseil de perfectionnement, dernier compte rendu/PV', 'Nom et qualité des personnes dédiées à la mobilité', 'Nom du référent handicap et PV de sa nomination', 'Missions remplies et exemples d''actions menées']::text[],
   ARRAY['apprentissage']::text[], false, false, false),
  (21, 'Le prestataire détermine, mobilise et évalue les compétences des différents intervenants internes et/ou externes, adaptées aux prestations.',
   ARRAY['Analyse des besoins de compétences et modalités de recrutement', 'CV des intervenants, formations initiales et continues', 'Entretiens professionnels, processus d''intégration', 'Sensibilisation des personnels à l''accueil des PSH', 'CBC : certifications détenues pour les tests psychotechniques']::text[],
   NULL, false, false, false),
  (22, 'Le prestataire entretient et développe les compétences de ses salariés, adaptées aux prestations qu''il délivre.',
   ARRAY['Plan de développement des compétences', 'Entretiens professionnels', 'Groupes d''analyse et d''échange de pratiques, communauté de pairs', 'Information sur les possibilités de formation (CPF, VAE)']::text[],
   NULL, false, true, false),
  (23, 'Le prestataire réalise une veille légale et réglementaire sur le champ de la formation professionnelle et en exploite les enseignements.',
   ARRAY['Abonnements, adhésions, participation à des salons, conférences, groupes normatifs', 'Veille réglementaire en matière de handicap', 'Actualisation des supports d''information et de contractualisation (règles CPF)', 'Diffusion des actualités légales et réglementaires au personnel']::text[],
   NULL, false, false, true),
  (24, 'Le prestataire réalise une veille sur les évolutions des compétences, des métiers et des emplois dans ses secteurs d''intervention et en exploite les enseignements.',
   ARRAY['Veille sur les évolutions des compétences, métiers et emplois', 'Participation à des conférences, colloques, salons', 'Adhésion à un réseau professionnel, abonnements à des revues', 'Diffusion au personnel et évolutions apportées aux prestations']::text[],
   NULL, false, true, true),
  (25, 'Le prestataire réalise une veille sur les innovations pédagogiques et technologiques permettant une évolution de ses prestations et en exploite les enseignements.',
   ARRAY['Veille sur les innovations pédagogiques et technologiques', 'Participation à des conférences, groupes de réflexion et d''analyse de pratiques', 'Diffusion au personnel, évolutions des modalités ou outils pédagogiques', 'Analyse d''opportunité et de faisabilité des innovations']::text[],
   NULL, false, true, true),
  (26, 'Le prestataire mobilise les expertises, outils et réseaux nécessaires pour accueillir, accompagner/former ou orienter les publics en situation de handicap.',
   ARRAY['Liste des partenaires du territoire (Agefiph, Fiphfp, Cap emploi, MDPH)', 'Participation aux instances, comptes rendus de rencontres', 'Compétences et connaissances actualisées du référent handicap', 'Charte d''engagement pour l''accessibilité, recours à Ressource Handicap Formation']::text[],
   NULL, false, true, false),
  (27, 'Lorsque le prestataire fait appel à la sous-traitance ou au portage salarial, il s''assure du respect de la conformité au présent référentiel.',
   ARRAY['Contrats de sous-traitance', 'Modalités de sélection et de pilotage des sous-traitants (process de sélection, animation qualité, charte)', 'Justificatifs présentés par les sous-traitants ou salariés portés']::text[],
   NULL, false, false, false),
  (28, 'Lorsque les prestations dispensées au bénéficiaire comprennent des périodes de formation en situation de travail, le prestataire mobilise son réseau de partenaires socio-économiques pour co-construire l''ingénierie de formation et favoriser l''accueil en entreprise.',
   ARRAY['Comités de pilotage, comptes rendus de réunions', 'Liste des entreprises partenaires, conventions de partenariat', 'Contacts réseau SPE', 'Livret alternance, informations sur les partenariats']::text[],
   ARRAY['action_formation', 'formation_continue', 'formation_initiale', 'apprentissage']::text[], false, false, true),
  (29, 'Le prestataire développe des actions qui concourent à l''insertion professionnelle ou la poursuite d''étude par la voie de l''apprentissage ou par toute autre voie permettant de développer leurs connaissances et leurs compétences.',
   ARRAY['Actions d''insertion (salons d''orientation, visites d''entreprise, ateliers CV, aide à la recherche d''emploi, réseau d''anciens)', 'Actions de promotion de la poursuite d''études', 'Partenariats avec les acteurs de l''insertion, de l''emploi et le monde professionnel', 'Diffusion des offres d''apprentissage et d''emploi, information sur les compétitions des métiers']::text[],
   ARRAY['apprentissage']::text[], false, false, false),
  (30, 'Le prestataire recueille les appréciations des parties prenantes : bénéficiaires, financeurs, équipes pédagogiques et entreprises concernées.',
   ARRAY['Enquêtes de satisfaction, questionnaires, évaluations à chaud et/ou à froid', 'Comptes rendus d''entretiens et de réunions d''équipes', 'Sollicitation des financeurs (au moins annuelle) ou participation à leurs webinaires', 'Consultation des sites des financeurs (ex. Anotéa)', 'CBC : questionnaire à l''issue du bilan et à 6 mois']::text[],
   NULL, false, false, true),
  (31, 'Le prestataire met en œuvre des modalités de traitement des difficultés rencontrées par les parties prenantes, des réclamations exprimées par ces dernières, des aléas survenus en cours de prestation.',
   ARRAY['Description et mise en œuvre des modalités (accusé de réception, réponses aux réclamants)', 'Tableau de suivi des réclamations et de leur traitement', 'Système de médiation', 'Traitement des difficultés et aléas, solutions apportées en cas d''imprévu']::text[],
   NULL, false, false, false),
  (32, 'Le prestataire met en œuvre des mesures d''amélioration à partir de l''analyse des appréciations et des réclamations.',
   ARRAY['Identification et analyse des causes d''abandon ou d''insatisfaction', 'Plans d''action d''amélioration, actions spécifiques', 'Tableau de suivi des mesures d''amélioration', 'VAE : partage des résultats de l''accompagnement']::text[],
   NULL, false, true, false)
) AS v(number, requirement, expected_proofs, applies_to, certifying_only, new_entrant, minor_nc_possible)
WHERE i.referential_version = 'v9' AND i.number = v.number;

-- ── 2. Moteur d'évaluation : un dossier sans catégorie est une formation ────
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

-- ── 3. Recalcul de toutes les check-lists ───────────────────────────────────
DO $$
DECLARE d RECORD;
BEGIN
  FOR d IN SELECT id FROM app.dossiers WHERE deleted_at IS NULL LOOP
    PERFORM app.recompute_qualiopi_checklist(d.id);
  END LOOP;
END $$;

-- ───────────── 0142_qualiopi_referentiel_v10.sql ─────────────

-- 0142 — Qualiopi : référentiel V10 (décret n° 2026-728), en vigueur le 1er novembre 2026
--
-- Le décret n° 2026-728 du 1er août 2026 (JORF n° 0180 du 4 août 2026)
-- remplace l'annexe du décret n° 2019-565 : 33 indicateurs au lieu de 32.
-- Comparaison des deux annexes officielles : 12 indicateurs modifiés sur le
-- fond (1, 2, 3, 7, 12, 14, 15, 19, 20, 27, 30, 32), une retouche de forme
-- (31), un nouvel indicateur (33, critère 7, réservé à l'apprentissage).
-- L'applicabilité par catégorie des indicateurs 1 à 32 est inchangée.
--
-- Les deux versions coexistent, bornées par leur date d'effet : la V9 cesse
-- le 31 octobre 2026, la V10 commence le 1er novembre. Le moteur retient déjà
-- la version en vigueur à la date du jour (0139) ; un recalcul nocturne des
-- check-lists fait basculer les dossiers en cours sans intervention.
--
-- Preuves, statuts et règles suivent le numéro de l'indicateur : ce qu'un
-- organisme a préparé sous la V9 compte encore sous la V10.
--
-- Non repris faute de texte publié : exemples de preuves, statut « nouvel
-- entrant » et gravité des écarts propres à la V10 (guide de lecture V10 à
-- venir) — ceux de la V9 sont conservés ; seuils des indicateurs 19 et 20
-- renvoyés à un arrêté.
--
-- Rejouable.

-- ── 1. La V9 cesse le 31 octobre 2026 ───────────────────────────────────────
UPDATE app.qualiopi_indicators
SET effective_until = DATE '2026-10-31'
WHERE referential_version = 'v9';

-- ── 2. Indicateurs 1 à 32 de la V10 ─────────────────────────────────────────
INSERT INTO app.qualiopi_indicators
  (code, number, scope, criterion, criterion_label, title, requirement,
   expected_proofs, referential_version, applies_to, certifying_only,
   condition, new_entrant, minor_nc_possible, auto_checks, effective_from,
   is_active)
SELECT
  'V10-I' || v9.number, v9.number, v9.scope, v9.criterion, v9.criterion_label,
  COALESCE(m.title, v9.title), COALESCE(m.requirement, v9.requirement),
  v9.expected_proofs, 'v10', v9.applies_to, v9.certifying_only,
  v9.condition, v9.new_entrant, v9.minor_nc_possible, v9.auto_checks,
  DATE '2026-11-01', true
FROM app.qualiopi_indicators v9
LEFT JOIN (VALUES
  (1, 'Le prestataire diffuse une information accessible au public, détaillée et vérifiable sur les prestations proposées : prérequis, objectifs, type de reconnaissance de la formation délivrée, durée, modalités pédagogiques et de financements, délais d''accès, tarifs, contacts, méthodes mobilisées et modalités d''évaluation, accessibilité aux personnes en situation de handicap. Sa communication ne comporte aucune mention de nature à induire le public en erreur, notamment sur les conditions d''accès, le contenu, les modalités pédagogiques, le financement des formations, les droits ou l''absence de droits de poursuite d''études conférés par la formation préparée.', NULL),
  (2, 'Le prestataire diffuse des indicateurs de résultats adaptés à la nature des prestations mises en œuvre et des publics accueillis en précisant de manière transparente leurs modalités de calcul ou en s''appuyant sur des dispositifs existants.', NULL),
  (3, 'Lorsque le prestataire met en œuvre des prestations conduisant à une certification professionnelle, il informe sur les taux d''obtention des certifications préparées, les possibilités de valider un/ ou des blocs de compétences, ainsi que sur les équivalences, passerelles, suites de parcours, en particulier les poursuites d''études, et les débouchés.', NULL),
  (7, 'Lorsque le prestataire met en œuvre des prestations conduisant à une certification professionnelle, il s''assure de l''adéquation du ou des contenus de la prestation aux exigences de la certification visée et peut prouver sa capacité à assurer cette certification, y compris en qualité d''organisme habilité.', 'Adéquation des contenus à la certification et capacité à la délivrer'),
  (12, 'Le prestataire décrit et met en œuvre les mesures pour favoriser l''engagement des bénéficiaires et prévenir les ruptures de parcours. Il s''assure de la prévention et du traitement de toute situation de violence, dont les violences sexistes et sexuelles, de harcèlement ou de discrimination dans le cadre de leur formation.', 'Engagement des bénéficiaires, prévention des ruptures et des violences'),
  (14, 'Le prestataire met en œuvre un accompagnement socio-professionnel, éducatif et relatif à l''exercice de la citoyenneté. Il dispose d''une procédure de traitement sans délai des situations de rupture liées à des difficultés, violences ou discriminations subies par l''apprenant en formation ou dans l''entreprise d''accueil.', 'Accompagnement socio-professionnel et traitement des ruptures (CFA)'),
  (15, 'Le prestataire informe les apprentis de leurs droits et devoirs en tant qu''apprentis et salariés ainsi que des règles applicables en matière de santé et de sécurité en milieu professionnel, de manière renforcée lorsqu''ils sont mineurs. Il les informe des dispositifs d''accompagnement, de prévention et de signalement des situations de violences, de harcèlement moral ou sexuel, d''agissements sexistes et de discriminations, ainsi que des interlocuteurs susceptibles de les accompagner. Il communique les coordonnées du médiateur de l''apprentissage et veille à signaler les dysfonctionnements à l''inspection du travail.', 'Information des apprentis : droits, santé, sécurité, signalement des violences'),
  (19, 'Le prestataire met à disposition du bénéficiaire des ressources pédagogiques et permet à celui-ci de se les approprier. Lorsque des modules pédagogiques sont réalisés à distance, le prestataire vérifie l''effectivité de leur suivi par les apprenants. Au-delà d''un nombre d''intervenants par formation, fixé par arrêté du ministre chargé de la formation professionnelle, le prestataire dispose d''un référent pédagogique par formation chargé d''assurer la coordination pédagogique entre les intervenants.', 'Ressources pédagogiques, suivi à distance et référent pédagogique'),
  (20, 'Le prestataire dispose d''un personnel dédié à l''appui à la mobilité nationale et internationale, d''un référent handicap et d''un conseil de perfectionnement. Il s''assure de la qualité du pilotage de la formation, de la participation des apprentis, formateurs et entreprises à sa gouvernance. Lorsque la proportion d''heures d''enseignement réalisées par des intervenants permanents est inférieure à un seuil fixé par arrêté du ministre chargé de la formation professionnelle, le prestataire s''assure de la mise en œuvre de modalités renforcées de supervision pédagogique et de contrôle de la qualité des interventions.', 'Mobilité, référent handicap, conseil de perfectionnement et gouvernance (CFA)'),
  (27, 'Lorsque le prestataire fait appel à la sous-traitance ou au portage salarial, il s''assure du respect de la conformité au présent référentiel et en assure la traçabilité dans les contrats de sous-traitance.', NULL),
  (30, 'Le prestataire recueille les appréciations des parties prenantes : bénéficiaires, financeurs (le cas échéant), équipes pédagogiques et entreprises concernées.', NULL),
  (31, 'Le prestataire met en œuvre des modalités de traitement des difficultés rencontrées par les parties prenantes, des réclamations exprimées par ces dernières ainsi que des aléas survenus en cours de prestation.', NULL),
  (32, 'Le prestataire met en place une démarche d''amélioration continue à partir de l''analyse des appréciations et des réclamations, ainsi qu''une analyse des risques sur la qualité des formations délivrées.', 'Démarche d''amélioration continue et analyse des risques')
) AS m(number, requirement, title) ON m.number = v9.number
WHERE v9.referential_version = 'v9'
ON CONFLICT (code) DO UPDATE SET
  title          = EXCLUDED.title,
  requirement    = EXCLUDED.requirement,
  effective_from = EXCLUDED.effective_from;

-- ── 3. Indicateur 33 : évaluation des enseignements par les apprenants ──────
INSERT INTO app.qualiopi_indicators
  (code, number, scope, criterion, criterion_label, title, requirement,
   expected_proofs, referential_version, applies_to, certifying_only,
   condition, new_entrant, minor_nc_possible, auto_checks, effective_from,
   is_active)
SELECT
  'V10-I33', 33, 'organization', 7, v9.criterion_label,
  'Évaluation des contenus et des enseignements par les apprenants',
  'Le prestataire met en place un dispositif d''évaluation des contenus et des enseignements par les apprenants, distinct du recueil général de satisfaction, dont les résultats sont partagés avec les équipes pédagogiques et donnent lieu à la formalisation d''une démarche d''amélioration continue, dont il mesure périodiquement l''efficacité.',
  '{}', 'v10', ARRAY['apprentissage']::text[], false,
  NULL, false, false, '{}', DATE '2026-11-01', true
FROM app.qualiopi_indicators v9
WHERE v9.referential_version = 'v9' AND v9.number = 30
ON CONFLICT (code) DO UPDATE SET
  requirement    = EXCLUDED.requirement,
  effective_from = EXCLUDED.effective_from;

-- ── 4. Règles : reprises au même numéro (système et organismes) ─────────────
INSERT INTO app.qualiopi_indicator_rules
  (organization_id, indicator_id, stage, is_blocking, satisfaction_source, is_active)
SELECT r.organization_id, n.id, r.stage, r.is_blocking, r.satisfaction_source, r.is_active
FROM app.qualiopi_indicator_rules r
JOIN app.qualiopi_indicators o ON o.id = r.indicator_id AND o.referential_version = 'v9'
JOIN app.qualiopi_indicators n ON n.referential_version = 'v10' AND n.number = o.number
WHERE r.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM app.qualiopi_indicator_rules x
    WHERE x.indicator_id = n.id
      AND x.organization_id IS NOT DISTINCT FROM r.organization_id);

-- ── 5. Moteur : une preuve de dossier compte au même numéro, toutes versions ─
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

-- ── 6. Recalcul nocturne des dossiers en cours ──────────────────────────────
-- Fait basculer les check-lists au changement de version, et rattrape toute
-- activité qui n'aurait pas déclenché de recalcul. Les dossiers clos gardent
-- la check-list établie à leur clôture.
CREATE OR REPLACE FUNCTION app.recompute_open_qualiopi_checklists()
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
  d RECORD;
  n INT := 0;
BEGIN
  FOR d IN
    SELECT id FROM app.dossiers
    WHERE deleted_at IS NULL
      AND status NOT IN ('closed', 'archived', 'cancelled')
  LOOP
    PERFORM app.recompute_qualiopi_checklist(d.id);
    n := n + 1;
  END LOOP;
  RETURN n;
END $$;

REVOKE ALL ON FUNCTION app.recompute_open_qualiopi_checklists() FROM PUBLIC;

DO $do$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'cron') THEN
    PERFORM cron.schedule(
      'qualiopi_recompute_nightly',
      '40 3 * * *',
      'SELECT app.recompute_open_qualiopi_checklists()'
    );
  END IF;
END $do$;

SELECT app.recompute_open_qualiopi_checklists();

-- ───────────── 0143_qualiopi_recalcul_evenementiel.sql ─────────────

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

-- ───────────── 0144_amelioration_continue_incidents_axes.sql ─────────────

-- 0144 — Amélioration continue : incidents, axes d'amélioration, actions correctives
--
-- Le module 0102 tenait un registre de veille et une liste d'actions reliées
-- aux réclamations. Il lui manquait, sur le modèle de Digiforma :
--
--  · les INCIDENTS — aléas, difficultés, abandons, insatisfactions survenus en
--    cours de prestation (indicateur 31 : « traitement des difficultés, des
--    réclamations et des aléas »). Les réclamations restent dans leur module ;
--    tout le reste n'avait nulle part où être consigné ;
--  · les AXES D'AMÉLIORATION — ce que l'organisme décide d'améliorer, suivi en
--    trois temps : à adresser, en cours, optimisé (indicateur 32, et l'analyse
--    des risques demandée par la V10) ;
--  · le lien entre les deux : une action corrective naît d'un incident ou
--    d'une réclamation, et sert un axe.
--
-- Rejouable.

-- ── 1. Incidents ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS app.quality_incidents (
  id              UUID PRIMARY KEY DEFAULT uuidv7(),
  organization_id UUID NOT NULL REFERENCES app.organizations(id) ON DELETE CASCADE,
  kind            TEXT NOT NULL CHECK (kind IN ('alea', 'difficulte', 'abandon', 'insatisfaction', 'autre')),
  title           TEXT NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 200),
  description     TEXT CHECK (description IS NULL OR length(description) <= 4000),
  dossier_id      UUID REFERENCES app.dossiers(id) ON DELETE SET NULL,
  occurred_on     DATE NOT NULL DEFAULT CURRENT_DATE,
  severity        TEXT NOT NULL DEFAULT 'moyenne' CHECK (severity IN ('faible', 'moyenne', 'elevee')),
  status          TEXT NOT NULL DEFAULT 'ouvert' CHECK (status IN ('ouvert', 'traite')),
  resolution      TEXT CHECK (resolution IS NULL OR length(resolution) <= 4000),
  resolved_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by      UUID REFERENCES auth.users(id),
  deleted_at      TIMESTAMPTZ NULL,
  -- Un incident ne se déclare pas traité sans dire comment.
  CHECK (status = 'ouvert' OR btrim(COALESCE(resolution, '')) <> '')
);
CREATE INDEX IF NOT EXISTS ix_quality_incidents_org
  ON app.quality_incidents (organization_id, status, occurred_on DESC) WHERE deleted_at IS NULL;

-- ── 2. Axes d'amélioration ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS app.improvement_axes (
  id               UUID PRIMARY KEY DEFAULT uuidv7(),
  organization_id  UUID NOT NULL REFERENCES app.organizations(id) ON DELETE CASCADE,
  title            TEXT NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 200),
  description      TEXT CHECK (description IS NULL OR length(description) <= 4000),
  -- Indicateur Qualiopi que l'axe sert, le cas échéant.
  indicator_number INT CHECK (indicator_number IS NULL OR indicator_number BETWEEN 1 AND 33),
  status           TEXT NOT NULL DEFAULT 'a_adresser' CHECK (status IN ('a_adresser', 'en_cours', 'optimise')),
  optimised_at     TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by       UUID REFERENCES auth.users(id),
  deleted_at       TIMESTAMPTZ NULL
);
CREATE INDEX IF NOT EXISTS ix_improvement_axes_org
  ON app.improvement_axes (organization_id, status) WHERE deleted_at IS NULL;

-- ── 3. Actions correctives : origine « incident », rattachement à un axe ────
ALTER TABLE app.improvement_actions
  ADD COLUMN IF NOT EXISTS incident_id UUID REFERENCES app.quality_incidents(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS axis_id     UUID REFERENCES app.improvement_axes(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS ix_improvement_incident ON app.improvement_actions (incident_id) WHERE incident_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_improvement_axis ON app.improvement_actions (axis_id) WHERE axis_id IS NOT NULL;

-- La contrainte d'origine de 0102 est remplacée, quel que soit son nom.
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'app.improvement_actions'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%origin%'
  LOOP
    EXECUTE format('ALTER TABLE app.improvement_actions DROP CONSTRAINT %I', r.conname);
  END LOOP;
END $$;
ALTER TABLE app.improvement_actions
  ADD CONSTRAINT improvement_actions_origin_check
  CHECK (origin IN ('reclamation', 'satisfaction', 'audit', 'veille', 'incident', 'autre'));

-- ── 4. RLS ──────────────────────────────────────────────────────────────────
ALTER TABLE app.quality_incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.quality_incidents FORCE ROW LEVEL SECURITY;
ALTER TABLE app.improvement_axes ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.improvement_axes FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS quality_incidents_select ON app.quality_incidents;
CREATE POLICY quality_incidents_select ON app.quality_incidents FOR SELECT TO authenticated
  USING (organization_id = app.current_organization_id() AND deleted_at IS NULL);
DROP POLICY IF EXISTS quality_incidents_insert ON app.quality_incidents;
CREATE POLICY quality_incidents_insert ON app.quality_incidents FOR INSERT TO authenticated
  WITH CHECK (organization_id = app.current_organization_id() AND app.is_staff());
DROP POLICY IF EXISTS quality_incidents_update ON app.quality_incidents;
CREATE POLICY quality_incidents_update ON app.quality_incidents FOR UPDATE TO authenticated
  USING (organization_id = app.current_organization_id() AND app.is_staff())
  WITH CHECK (organization_id = app.current_organization_id() AND app.is_staff());

DROP POLICY IF EXISTS improvement_axes_select ON app.improvement_axes;
CREATE POLICY improvement_axes_select ON app.improvement_axes FOR SELECT TO authenticated
  USING (organization_id = app.current_organization_id() AND deleted_at IS NULL);
DROP POLICY IF EXISTS improvement_axes_insert ON app.improvement_axes;
CREATE POLICY improvement_axes_insert ON app.improvement_axes FOR INSERT TO authenticated
  WITH CHECK (organization_id = app.current_organization_id() AND app.is_staff());
DROP POLICY IF EXISTS improvement_axes_update ON app.improvement_axes;
CREATE POLICY improvement_axes_update ON app.improvement_axes FOR UPDATE TO authenticated
  USING (organization_id = app.current_organization_id() AND app.is_staff())
  WITH CHECK (organization_id = app.current_organization_id() AND app.is_staff());

COMMENT ON TABLE app.quality_incidents IS
  'Aléas, difficultés, abandons, insatisfactions survenus en cours de prestation (Qualiopi indicateur 31).';
COMMENT ON TABLE app.improvement_axes IS
  'Axes d''amélioration de l''organisme : à adresser, en cours, optimisé (Qualiopi indicateur 32).';

NOTIFY pgrst, 'reload schema';

-- ───────────── 0145_emargement_entree_sortie.sql ─────────────

-- 0145 — Émargement : réparation de la signature, entrée + sortie, statuts
--
-- Constat (audit émargement, 2026-09-11) : aucune signature ne pouvait aboutir.
--  · Les jetons de signature n'étaient jamais enregistrés dans
--    `attendance_token_jtis` : la consommation refusait tout lien (« token_unknown »).
--  · `record_attendance_signature` écrivait son événement avec une colonne
--    `kind` inexistante et sans `aggregate_type` : l'insertion échouait, et
--    avec elle la signature (et l'import Zoom CSV).
--  · Une nouvelle signature écrasait la précédente ; le signataire n'était
--    jamais comparé aux participants attendus ; aucune fenêtre horaire.
--  · Les feuilles de session de groupe (sans dossier) étaient introuvables
--    depuis la page de signature (jointure interne sur le dossier).
--
-- Nouveau modèle, repris de SoSafe (lui-même inspiré de Digiforma) :
--  · chaque demi-journée se signe à l'ENTRÉE puis à la SORTIE, avec le même
--    lien personnel ; la sortie est refusée avant l'entrée ;
--  · retard et départ anticipé sont constatés à partir de l'heure de signature
--    (au-delà de 15 minutes), et ajustables par l'équipe ;
--  · l'équipe peut marquer un absent, un absent excusé (motif obligatoire), un
--    retard ou un départ anticipé depuis une grille ;
--  · une signature se dessine, sauf la confirmation de présence en visio.
--
-- Rejouable.

-- ── 1. Colonnes ─────────────────────────────────────────────────────────────
ALTER TABLE app.attendance_signatures
  ADD COLUMN IF NOT EXISTS exit_signed_at         TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS exit_image_path        TEXT,
  ADD COLUMN IF NOT EXISTS exit_signer_ip         INET,
  ADD COLUMN IF NOT EXISTS exit_signer_user_agent TEXT,
  ADD COLUMN IF NOT EXISTS exit_signature_hash    TEXT,
  ADD COLUMN IF NOT EXISTS late_arrival_time      TIME,
  ADD COLUMN IF NOT EXISTS early_departure_time   TIME,
  ADD COLUMN IF NOT EXISTS absence_reason         TEXT
    CHECK (absence_reason IS NULL OR length(absence_reason) <= 1000),
  -- Comment la présence a été recueillie : lien personnel, QR imprimé,
  -- tablette de l'organisme, confirmation visio, grille de l'équipe, Zoom.
  ADD COLUMN IF NOT EXISTS capture_mode           TEXT
    CHECK (capture_mode IS NULL OR capture_mode IN ('lien', 'qr', 'tablette', 'visio', 'grille', 'zoom')),
  ADD COLUMN IF NOT EXISTS marked_by              UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- Un même lien sert à l'entrée puis à la sortie.
ALTER TABLE app.attendance_token_jtis
  ADD COLUMN IF NOT EXISTS entry_consumed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS exit_consumed_at  TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS ix_token_jtis_reuse
  ON app.attendance_token_jtis (attendance_sheet_id, signer_kind, signer_id)
  WHERE status = 'issued';

-- Envoi automatique des liens avant chaque demi-journée : désactivé par défaut.
ALTER TABLE app.organizations
  ADD COLUMN IF NOT EXISTS attendance_auto_send BOOLEAN NOT NULL DEFAULT false;

-- ── 2. Fenêtre horaire d'une feuille ────────────────────────────────────────
-- Même règle que la création des feuilles (0082) : frontière à 13:00, Paris.
CREATE OR REPLACE FUNCTION app.attendance_sheet_window(
  p_sheet_id UUID,
  OUT window_start TIMESTAMPTZ,
  OUT window_end TIMESTAMPTZ
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = app, public
AS $$
  SELECT
    CASE WHEN sh.half_day = 'afternoon' THEN GREATEST(s.starts_at, b.midi) ELSE s.starts_at END,
    CASE WHEN sh.half_day = 'morning'   THEN LEAST(s.ends_at, b.midi)      ELSE s.ends_at   END
  FROM app.attendance_sheets sh
  JOIN app.sessions s ON s.id = sh.session_id
  CROSS JOIN LATERAL (
    SELECT (((s.starts_at AT TIME ZONE 'Europe/Paris')::date + TIME '13:00')
            AT TIME ZONE 'Europe/Paris') AS midi
  ) b
  WHERE sh.id = p_sheet_id
$$;

-- ── 3. Signataires attendus d'une session ───────────────────────────────────
-- Apprenants : participants inscrits, et apprenants des dossiers de la session
-- (la matérialisation des participants passe par une tâche qui peut ne pas
-- avoir tourné), moins ceux retirés à la main. Formateurs : participants
-- inscrits et formateurs affectés aux dossiers de la session.
CREATE OR REPLACE FUNCTION app.session_expected_signers(p_session_id UUID)
RETURNS TABLE (participant_kind TEXT, participant_id UUID)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = app, public
AS $$
  WITH dossiers_session AS (
    SELECT s.dossier_id AS id FROM app.sessions s WHERE s.id = p_session_id AND s.dossier_id IS NOT NULL
    UNION
    SELECT sd.dossier_id FROM app.session_dossiers sd WHERE sd.session_id = p_session_id
  ),
  retires AS (
    SELECT sp.participant_kind, sp.participant_id
    FROM app.session_participants sp
    WHERE sp.session_id = p_session_id AND sp.source = 'manual_remove'
  ),
  candidats AS (
    SELECT 'learner'::text AS participant_kind, sp.learner_id AS participant_id
    FROM app.session_participants sp
    WHERE sp.session_id = p_session_id AND sp.participant_kind = 'learner' AND sp.source <> 'manual_remove'
    UNION
    SELECT 'learner', d.learner_id
    FROM app.dossiers d
    JOIN app.sessions s ON s.id = p_session_id
    WHERE d.id = s.dossier_id AND d.deleted_at IS NULL
    UNION
    SELECT 'learner', a.learner_id FROM app.derive_session_attendees(p_session_id) a
    UNION
    SELECT 'trainer', sp.trainer_id
    FROM app.session_participants sp
    WHERE sp.session_id = p_session_id AND sp.participant_kind = 'trainer' AND sp.source <> 'manual_remove'
    UNION
    SELECT 'trainer', dt.trainer_id
    FROM app.dossier_trainers dt
    WHERE dt.dossier_id IN (SELECT id FROM dossiers_session)
  )
  SELECT c.participant_kind, c.participant_id
  FROM candidats c
  WHERE c.participant_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM retires r
      WHERE r.participant_kind = c.participant_kind AND r.participant_id = c.participant_id)
$$;

-- Une présence est-elle signée par la personne elle-même (et non attestée) ?
CREATE OR REPLACE FUNCTION app.attendance_self_signed(
  p_capture_mode TEXT, p_evidence_source TEXT, p_signed_at TIMESTAMPTZ
) RETURNS BOOLEAN
LANGUAGE sql IMMUTABLE
AS $$
  SELECT p_signed_at IS NOT NULL AND (
    p_capture_mode IN ('lien', 'qr', 'tablette', 'visio')
    OR (p_capture_mode IS NULL AND p_evidence_source IN ('qr', 'manual')))
$$;

-- ── 4. Consommation d'un lien, étape par étape ──────────────────────────────
CREATE OR REPLACE FUNCTION app.consume_attendance_token_step(
  p_jti UUID,
  p_attendance_sheet_id UUID,
  p_signer_id UUID,
  p_signer_kind TEXT,
  p_moment TEXT,
  p_ip INET
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
  v_row app.attendance_token_jtis;
BEGIN
  SELECT * INTO v_row FROM app.attendance_token_jtis WHERE jti = p_jti FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'token_unknown' USING ERRCODE = 'P0003';
  END IF;
  IF v_row.status <> 'issued' THEN
    RAISE EXCEPTION 'token_%', v_row.status USING ERRCODE = 'P0003';
  END IF;
  IF v_row.expires_at < now() THEN
    UPDATE app.attendance_token_jtis SET status = 'expired' WHERE jti = p_jti;
    RAISE EXCEPTION 'token_expired' USING ERRCODE = 'P0003';
  END IF;
  IF v_row.attendance_sheet_id <> p_attendance_sheet_id
     OR v_row.signer_id <> p_signer_id
     OR v_row.signer_kind <> p_signer_kind THEN
    RAISE EXCEPTION 'token_payload_mismatch' USING ERRCODE = 'P0003';
  END IF;

  IF p_moment = 'entry' THEN
    IF v_row.entry_consumed_at IS NOT NULL THEN
      RAISE EXCEPTION 'token_entry_used' USING ERRCODE = 'P0003';
    END IF;
    UPDATE app.attendance_token_jtis
       SET entry_consumed_at = now(), consumed_ip = p_ip
     WHERE jti = p_jti;
  ELSE
    IF v_row.exit_consumed_at IS NOT NULL THEN
      RAISE EXCEPTION 'token_exit_used' USING ERRCODE = 'P0003';
    END IF;
    UPDATE app.attendance_token_jtis
       SET exit_consumed_at = now(), consumed_at = now(), status = 'consumed', consumed_ip = p_ip
     WHERE jti = p_jti;
  END IF;
END $$;

-- ── 5. Signature d'une étape (entrée ou sortie) ─────────────────────────────
CREATE OR REPLACE FUNCTION app.record_attendance_step(
  p_attendance_sheet_id UUID,
  p_signer_id UUID,
  p_signer_kind TEXT,
  p_moment TEXT,
  p_image_path TEXT,
  p_signature_hash TEXT,
  p_signer_ip INET,
  p_signer_user_agent TEXT,
  p_signer_country CHAR(2),
  p_token_jti UUID,
  p_capture_mode TEXT,
  p_actor UUID
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
  v_sheet    RECORD;
  v_modality TEXT;
  v_win      RECORD;
  v_row      app.attendance_signatures;
  v_found    BOOLEAN;
  v_id       UUID;
  v_now      TIMESTAMPTZ := now();
  v_local    TIME := date_trunc('minute', now() AT TIME ZONE 'Europe/Paris')::time;
  v_status   app.attendance_status := 'present';
  v_late     TIME;
  v_early    TIME;
BEGIN
  IF p_signer_kind NOT IN ('learner', 'trainer') THEN
    RAISE EXCEPTION 'invalid_signer_kind' USING ERRCODE = 'P0001';
  END IF;
  IF p_moment NOT IN ('entry', 'exit') THEN
    RAISE EXCEPTION 'invalid_moment' USING ERRCODE = 'P0001';
  END IF;
  IF p_capture_mode NOT IN ('lien', 'qr', 'tablette', 'visio') THEN
    RAISE EXCEPTION 'invalid_capture_mode' USING ERRCODE = 'P0001';
  END IF;

  SELECT sh.id, sh.organization_id, sh.session_id, sh.status
    INTO v_sheet
    FROM app.attendance_sheets sh
   WHERE sh.id = p_attendance_sheet_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'attendance_sheet_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF v_sheet.status = 'finalized' THEN
    RAISE EXCEPTION 'attendance_sheet_finalized' USING ERRCODE = 'P0010';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM app.session_expected_signers(v_sheet.session_id) e
    WHERE e.participant_kind = p_signer_kind AND e.participant_id = p_signer_id
  ) THEN
    RAISE EXCEPTION 'signer_not_expected' USING ERRCODE = 'P0001';
  END IF;

  SELECT s.modality::text INTO v_modality FROM app.sessions s WHERE s.id = v_sheet.session_id;
  IF p_image_path IS NULL AND NOT (p_capture_mode = 'visio' AND v_modality IN ('distanciel', 'hybride')) THEN
    RAISE EXCEPTION 'signature_required' USING ERRCODE = 'P0001';
  END IF;

  -- Entrée : d'une heure avant le début à la fin de la demi-journée.
  -- Sortie : du début à deux heures après la fin.
  SELECT * INTO v_win FROM app.attendance_sheet_window(p_attendance_sheet_id);
  IF (p_moment = 'entry' AND (v_now < v_win.window_start - interval '60 minutes' OR v_now > v_win.window_end))
     OR (p_moment = 'exit' AND (v_now < v_win.window_start OR v_now > v_win.window_end + interval '120 minutes')) THEN
    RAISE EXCEPTION 'outside_signing_window' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_row
    FROM app.attendance_signatures
   WHERE attendance_sheet_id = p_attendance_sheet_id
     AND participant_kind = p_signer_kind
     AND participant_id = p_signer_id
   FOR UPDATE;
  v_found := FOUND;

  IF p_moment = 'entry' THEN
    -- Une signature ne s'écrase jamais ; une présence attestée par l'équipe,
    -- elle, cède la place à la signature de la personne.
    IF v_found AND app.attendance_self_signed(v_row.capture_mode, v_row.evidence_source, v_row.signed_at) THEN
      RAISE EXCEPTION 'already_signed_entry' USING ERRCODE = 'P0001';
    END IF;
    IF p_token_jti IS NOT NULL THEN
      PERFORM app.consume_attendance_token_step(
        p_token_jti, p_attendance_sheet_id, p_signer_id, p_signer_kind, 'entry', p_signer_ip);
    END IF;

    IF p_signer_kind = 'learner' AND v_now > v_win.window_start + interval '15 minutes' THEN
      v_status := 'late';
      v_late := v_local;
    END IF;

    INSERT INTO app.attendance_signatures (
      organization_id, attendance_sheet_id, participant_kind, learner_id, trainer_id,
      status, signature_image_path, signed_at,
      signer_ip, signer_user_agent, signer_country, signature_hash, token_id,
      evidence_source, capture_mode, late_arrival_time, absence_reason, marked_by
    ) VALUES (
      v_sheet.organization_id, p_attendance_sheet_id, p_signer_kind,
      CASE WHEN p_signer_kind = 'learner' THEN p_signer_id END,
      CASE WHEN p_signer_kind = 'trainer' THEN p_signer_id END,
      v_status, p_image_path, v_now,
      p_signer_ip, p_signer_user_agent, p_signer_country, p_signature_hash, p_token_jti,
      CASE WHEN p_capture_mode = 'tablette' THEN 'manual' ELSE 'qr' END,
      p_capture_mode, v_late, NULL, p_actor
    )
    ON CONFLICT (attendance_sheet_id, participant_kind, participant_id) DO UPDATE SET
      status               = EXCLUDED.status,
      signature_image_path = EXCLUDED.signature_image_path,
      signed_at            = EXCLUDED.signed_at,
      signer_ip            = EXCLUDED.signer_ip,
      signer_user_agent    = EXCLUDED.signer_user_agent,
      signer_country       = EXCLUDED.signer_country,
      signature_hash       = EXCLUDED.signature_hash,
      token_id             = EXCLUDED.token_id,
      evidence_source      = EXCLUDED.evidence_source,
      capture_mode         = EXCLUDED.capture_mode,
      late_arrival_time    = COALESCE(EXCLUDED.late_arrival_time, app.attendance_signatures.late_arrival_time),
      absence_reason       = NULL,
      marked_by            = EXCLUDED.marked_by
    RETURNING id INTO v_id;
  ELSE
    IF NOT v_found OR v_row.signed_at IS NULL OR v_row.status IN ('absent', 'absent_justified') THEN
      RAISE EXCEPTION 'entry_required' USING ERRCODE = 'P0001';
    END IF;
    IF v_row.exit_signed_at IS NOT NULL THEN
      RAISE EXCEPTION 'already_signed_exit' USING ERRCODE = 'P0001';
    END IF;
    IF p_token_jti IS NOT NULL THEN
      PERFORM app.consume_attendance_token_step(
        p_token_jti, p_attendance_sheet_id, p_signer_id, p_signer_kind, 'exit', p_signer_ip);
    END IF;

    IF p_signer_kind = 'learner' AND v_now < v_win.window_end - interval '15 minutes' THEN
      v_early := v_local;
    END IF;

    UPDATE app.attendance_signatures
       SET exit_signed_at         = v_now,
           exit_image_path        = p_image_path,
           exit_signer_ip         = p_signer_ip,
           exit_signer_user_agent = p_signer_user_agent,
           exit_signature_hash    = p_signature_hash,
           early_departure_time   = COALESCE(v_early, early_departure_time)
     WHERE id = v_row.id
    RETURNING id, status INTO v_id, v_status;
  END IF;

  INSERT INTO infra.domain_events (organization_id, aggregate_type, aggregate_id, type, payload)
  VALUES (
    v_sheet.organization_id, 'attendance_sheet', p_attendance_sheet_id, 'attendance.signature_recorded',
    jsonb_build_object(
      'signature_id', v_id, 'moment', p_moment, 'signer_kind', p_signer_kind,
      'signer_id', p_signer_id, 'capture_mode', p_capture_mode)
  );

  RETURN jsonb_build_object(
    'signature_id', v_id,
    'moment', p_moment,
    'signed_at', v_now,
    'status', v_status,
    'late_arrival_time', v_late,
    'early_departure_time', v_early
  );
END $$;

-- ── 6. Marquage par l'équipe (grille, visio) ────────────────────────────────
CREATE OR REPLACE FUNCTION app.set_attendance_mark(
  p_attendance_sheet_id UUID,
  p_learner_id UUID,
  p_status app.attendance_status,
  p_late_arrival TIME,
  p_early_departure TIME,
  p_reason TEXT,
  p_capture_mode TEXT,
  p_actor UUID
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
  v_sheet RECORD;
  v_id    UUID;
  v_now   TIMESTAMPTZ := now();
  v_here  BOOLEAN := p_status IN ('present', 'late', 'remote');
BEGIN
  IF p_capture_mode NOT IN ('grille', 'visio') THEN
    RAISE EXCEPTION 'invalid_capture_mode' USING ERRCODE = 'P0001';
  END IF;
  IF NOT v_here AND (p_late_arrival IS NOT NULL OR p_early_departure IS NOT NULL) THEN
    RAISE EXCEPTION 'incoherent_mark' USING ERRCODE = 'P0001';
  END IF;
  IF p_status = 'absent_justified' AND btrim(COALESCE(p_reason, '')) = '' THEN
    RAISE EXCEPTION 'reason_required' USING ERRCODE = 'P0001';
  END IF;

  SELECT sh.id, sh.organization_id, sh.session_id, sh.status
    INTO v_sheet
    FROM app.attendance_sheets sh
   WHERE sh.id = p_attendance_sheet_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'attendance_sheet_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF v_sheet.status = 'finalized' THEN
    RAISE EXCEPTION 'attendance_sheet_finalized' USING ERRCODE = 'P0010';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM app.session_expected_signers(v_sheet.session_id) e
    WHERE e.participant_kind = 'learner' AND e.participant_id = p_learner_id
  ) THEN
    RAISE EXCEPTION 'signer_not_expected' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO app.attendance_signatures (
    organization_id, attendance_sheet_id, participant_kind, learner_id,
    status, signed_at, evidence_source, capture_mode,
    late_arrival_time, early_departure_time, absence_reason, marked_by
  ) VALUES (
    v_sheet.organization_id, p_attendance_sheet_id, 'learner', p_learner_id,
    p_status, CASE WHEN v_here THEN v_now END, 'trainer_override', p_capture_mode,
    p_late_arrival, p_early_departure, NULLIF(btrim(COALESCE(p_reason, '')), ''), p_actor
  )
  ON CONFLICT (attendance_sheet_id, participant_kind, participant_id) DO UPDATE SET
    status = EXCLUDED.status,
    -- Une signature déjà posée est conservée : l'équipe corrige le statut,
    -- elle n'efface pas la preuve (le journal d'audit garde l'avant/après).
    signed_at = CASE
      WHEN app.attendance_self_signed(app.attendance_signatures.capture_mode,
                                      app.attendance_signatures.evidence_source,
                                      app.attendance_signatures.signed_at)
        THEN app.attendance_signatures.signed_at
      WHEN EXCLUDED.status IN ('present', 'late', 'remote')
        THEN COALESCE(app.attendance_signatures.signed_at, EXCLUDED.signed_at)
      ELSE NULL END,
    evidence_source = CASE
      WHEN app.attendance_self_signed(app.attendance_signatures.capture_mode,
                                      app.attendance_signatures.evidence_source,
                                      app.attendance_signatures.signed_at)
        THEN app.attendance_signatures.evidence_source
      ELSE 'trainer_override' END,
    capture_mode = CASE
      WHEN app.attendance_self_signed(app.attendance_signatures.capture_mode,
                                      app.attendance_signatures.evidence_source,
                                      app.attendance_signatures.signed_at)
        THEN app.attendance_signatures.capture_mode
      ELSE EXCLUDED.capture_mode END,
    late_arrival_time    = EXCLUDED.late_arrival_time,
    early_departure_time = EXCLUDED.early_departure_time,
    absence_reason       = EXCLUDED.absence_reason,
    marked_by            = EXCLUDED.marked_by
  RETURNING id INTO v_id;

  RETURN v_id;
END $$;

-- ── 7. Ancienne RPC : événement réparé (utilisée par d'anciens chemins) ─────
CREATE OR REPLACE FUNCTION app.record_attendance_signature(
  p_attendance_sheet_id UUID,
  p_signer_id UUID,
  p_signer_kind TEXT,
  p_image_path TEXT,
  p_signature_hash TEXT,
  p_signer_ip INET,
  p_signer_user_agent TEXT,
  p_signer_country CHAR(2),
  p_token_jti UUID,
  p_evidence_source TEXT,
  p_evidence_payload JSONB
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
  v_org_id UUID;
  v_signature_id UUID;
BEGIN
  IF p_signer_kind NOT IN ('learner','trainer') THEN
    RAISE EXCEPTION 'invalid_signer_kind' USING ERRCODE = 'P0001';
  END IF;
  IF p_evidence_source NOT IN ('manual','qr','zoom_csv','zoom_api','trainer_override') THEN
    RAISE EXCEPTION 'invalid_evidence_source' USING ERRCODE = 'P0001';
  END IF;

  SELECT organization_id INTO v_org_id
    FROM app.attendance_sheets
   WHERE id = p_attendance_sheet_id
   FOR UPDATE;
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'attendance_sheet_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF p_token_jti IS NOT NULL THEN
    PERFORM app.consume_attendance_token(
      p_token_jti, p_attendance_sheet_id, p_signer_id, p_signer_kind, p_signer_ip
    );
  END IF;

  INSERT INTO app.attendance_signatures (
    organization_id, attendance_sheet_id, participant_kind,
    learner_id, trainer_id,
    status, signature_image_path, signed_at,
    signer_ip, signer_user_agent, signer_country,
    signature_hash, token_id,
    evidence_source, evidence_payload
  ) VALUES (
    v_org_id, p_attendance_sheet_id, p_signer_kind,
    CASE WHEN p_signer_kind = 'learner' THEN p_signer_id END,
    CASE WHEN p_signer_kind = 'trainer' THEN p_signer_id END,
    'present', p_image_path, now(),
    p_signer_ip, p_signer_user_agent, p_signer_country,
    p_signature_hash, p_token_jti,
    p_evidence_source, p_evidence_payload
  )
  ON CONFLICT (attendance_sheet_id, participant_kind, participant_id)
  DO UPDATE SET
    status = 'present',
    signature_image_path = EXCLUDED.signature_image_path,
    signed_at = EXCLUDED.signed_at,
    signer_ip = EXCLUDED.signer_ip,
    signer_user_agent = EXCLUDED.signer_user_agent,
    signer_country = EXCLUDED.signer_country,
    signature_hash = EXCLUDED.signature_hash,
    token_id = EXCLUDED.token_id,
    evidence_source = EXCLUDED.evidence_source,
    evidence_payload = EXCLUDED.evidence_payload
  RETURNING id INTO v_signature_id;

  INSERT INTO infra.domain_events (organization_id, aggregate_type, aggregate_id, type, payload)
  VALUES (
    v_org_id, 'attendance_sheet', p_attendance_sheet_id, 'attendance.signature_recorded',
    jsonb_build_object(
      'signature_id', v_signature_id,
      'signer_kind', p_signer_kind,
      'signer_id', p_signer_id,
      'evidence_source', p_evidence_source
    )
  );

  RETURN v_signature_id;
END;
$$;

-- ── 8. Contexte de la page de signature ─────────────────────────────────────
-- Feuilles de groupe comprises (sans dossier) : la formation vient de la
-- session, et l'on retrouve le dossier de l'apprenant pour son espace.
DROP FUNCTION IF EXISTS app.get_signature_context(UUID, UUID, TEXT);
CREATE FUNCTION app.get_signature_context(
  p_attendance_sheet_id UUID,
  p_signer_id UUID,
  p_signer_kind TEXT
)
RETURNS TABLE (
  attendance_sheet_id UUID,
  signer_id UUID,
  signer_kind TEXT,
  signer_full_name TEXT,
  learner_dossier_id UUID,
  dossier_reference TEXT,
  formation_title TEXT,
  session_id UUID,
  session_title TEXT,
  session_starts_at TIMESTAMPTZ,
  session_ends_at TIMESTAMPTZ,
  session_modality TEXT,
  half_day TEXT,
  window_start TIMESTAMPTZ,
  window_end TIMESTAMPTZ,
  organization_id UUID,
  organization_name TEXT,
  sheet_finalized BOOLEAN,
  expected BOOLEAN,
  entry_signed_at TIMESTAMPTZ,
  exit_signed_at TIMESTAMPTZ,
  attendance_status TEXT
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = app, public
AS $$
  WITH ctx AS (
    SELECT sh.*, s.title AS s_title, s.starts_at, s.ends_at, s.modality::text AS modality,
           s.formation_id AS s_formation_id, s.dossier_id AS s_dossier_id
    FROM app.attendance_sheets sh
    JOIN app.sessions s ON s.id = sh.session_id
    WHERE sh.id = p_attendance_sheet_id
  ),
  dossier_apprenant AS (
    SELECT d.id, d.reference, d.formation_id
    FROM app.dossiers d, ctx
    WHERE p_signer_kind = 'learner'
      AND d.learner_id = p_signer_id
      AND d.deleted_at IS NULL
      AND (d.id = ctx.s_dossier_id
           OR d.id IN (SELECT sd.dossier_id FROM app.session_dossiers sd WHERE sd.session_id = ctx.session_id))
    LIMIT 1
  )
  SELECT
    ctx.id,
    p_signer_id,
    p_signer_kind,
    CASE p_signer_kind
      WHEN 'learner' THEN (SELECT l.first_name || ' ' || l.last_name FROM app.learners l WHERE l.id = p_signer_id)
      WHEN 'trainer' THEN (SELECT t.first_name || ' ' || t.last_name FROM app.trainers t WHERE t.id = p_signer_id)
    END,
    (SELECT id FROM dossier_apprenant),
    COALESCE((SELECT reference FROM dossier_apprenant),
             (SELECT d.reference FROM app.dossiers d WHERE d.id = ctx.dossier_id)),
    (SELECT f.title FROM app.formations f
      WHERE f.id = COALESCE(ctx.s_formation_id,
                            (SELECT formation_id FROM dossier_apprenant),
                            (SELECT d.formation_id FROM app.dossiers d WHERE d.id = ctx.dossier_id))),
    ctx.session_id,
    ctx.s_title,
    ctx.starts_at,
    ctx.ends_at,
    ctx.modality,
    ctx.half_day,
    w.window_start,
    w.window_end,
    o.id,
    o.name,
    ctx.status = 'finalized',
    EXISTS (SELECT 1 FROM app.session_expected_signers(ctx.session_id) e
            WHERE e.participant_kind = p_signer_kind AND e.participant_id = p_signer_id),
    CASE WHEN app.attendance_self_signed(sig.capture_mode, sig.evidence_source, sig.signed_at)
         THEN sig.signed_at END,
    sig.exit_signed_at,
    sig.status::text
  FROM ctx
  JOIN app.organizations o ON o.id = ctx.organization_id
  CROSS JOIN LATERAL app.attendance_sheet_window(ctx.id) w
  LEFT JOIN app.attendance_signatures sig
    ON sig.attendance_sheet_id = ctx.id
   AND sig.participant_kind = p_signer_kind
   AND sig.participant_id = p_signer_id
$$;

-- ── 9. Droits : service role uniquement ─────────────────────────────────────
REVOKE ALL ON FUNCTION app.attendance_sheet_window(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.session_expected_signers(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.consume_attendance_token_step(UUID, UUID, UUID, TEXT, TEXT, INET) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.record_attendance_step(UUID, UUID, TEXT, TEXT, TEXT, TEXT, INET, TEXT, CHAR, UUID, TEXT, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.set_attendance_mark(UUID, UUID, app.attendance_status, TIME, TIME, TEXT, TEXT, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.get_signature_context(UUID, UUID, TEXT) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION app.attendance_sheet_window(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION app.session_expected_signers(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION app.consume_attendance_token_step(UUID, UUID, UUID, TEXT, TEXT, INET) TO service_role;
GRANT EXECUTE ON FUNCTION app.record_attendance_step(UUID, UUID, TEXT, TEXT, TEXT, TEXT, INET, TEXT, CHAR, UUID, TEXT, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION app.set_attendance_mark(UUID, UUID, app.attendance_status, TIME, TIME, TEXT, TEXT, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION app.get_signature_context(UUID, UUID, TEXT) TO service_role;

NOTIFY pgrst, 'reload schema';

-- ───────────── 0146_emargement_heures_rgpd.sql ─────────────

-- 0146 — Émargement : heures réellement suivies, recalcul immédiat, RGPD
--
-- Constats (audit émargement, 2026-09-11) :
--  · Les heures « suivies » créditaient la séance ENTIÈRE dès qu'une demi-
--    journée portait une présence (`bool_or`) : une après-midi manquée n'était
--    jamais déduite, retards et départs anticipés non plus.
--  · Ce recalcul passait par un événement traité par une tâche qui ne tourne
--    pas (le répartiteur est programmé via GitHub, bloqué) : les heures et le
--    taux d'assiduité des attestations restaient figés.
--  · La purge des IP à 5 ans et l'anonymisation d'un apprenant modifient ses
--    signatures ; sur une feuille clôturée, le verrou d'immutabilité les
--    refusait — et la purge, en une seule instruction, échouait en entier.
--    Les colonnes de sortie (0145) n'étaient pas couvertes.
--  · La table de suivi des heures était modifiable par tout membre connecté.
--
-- Rejouable.

-- ── 1. Heures suivies, demi-journée par demi-journée ────────────────────────
CREATE OR REPLACE FUNCTION app.recompute_dossier_hours(p_dossier_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = app, public
AS $$
DECLARE
  v_org UUID; v_learner UUID; v_total NUMERIC; v_start DATE; v_end DATE; v_aband DATE;
  v_delivered NUMERIC := 0; v_attended NUMERIC := 0; v_remaining NUMERIC := 0;
  v_held INT := 0; v_abs INT := 0; v_abs_j INT := 0;
  v_projected NUMERIC; v_rate NUMERIC; v_at_risk BOOLEAN; v_was_at_risk BOOLEAN;
BEGIN
  SELECT organization_id, learner_id, total_hours, start_date, end_date, abandoned_at
    INTO v_org, v_learner, v_total, v_start, v_end, v_aband
  FROM app.dossiers WHERE id = p_dossier_id;
  IF v_org IS NULL THEN RETURN; END IF;

  WITH sess AS (
    SELECT DISTINCT s.id, s.duration_hours, s.status, s.starts_at, s.ends_at
    FROM app.session_dossiers sd
    JOIN app.sessions s ON s.id = sd.session_id
    WHERE sd.dossier_id = p_dossier_id AND s.status <> 'cancelled'
  ),
  classified AS (
    SELECT *,
      (status = 'done' OR ends_at < now())            AS held,
      (v_aband IS NULL OR starts_at::date <= v_aband)  AS in_window
    FROM sess
  )
  SELECT
    COALESCE(sum(duration_hours) FILTER (WHERE held AND in_window), 0),
    COALESCE(sum(duration_hours) FILTER (WHERE NOT held AND in_window AND v_aband IS NULL), 0),
    COUNT(*) FILTER (WHERE held AND in_window)
  INTO v_delivered, v_remaining, v_held
  FROM classified;

  -- Chaque feuille (matin, après-midi) vaut sa propre fenêtre ; une présence
  -- en retard ou partie avant la fin ne compte que le temps effectivement suivi.
  WITH held_sessions AS (
    SELECT DISTINCT s.id
    FROM app.session_dossiers sd
    JOIN app.sessions s ON s.id = sd.session_id
    WHERE sd.dossier_id = p_dossier_id AND s.status <> 'cancelled'
      AND (s.status = 'done' OR s.ends_at < now())
      AND (v_aband IS NULL OR s.starts_at::date <= v_aband)
  ),
  feuilles AS (
    SELECT w.window_start, w.window_end, sig.status, sig.late_arrival_time, sig.early_departure_time,
           (w.window_start AT TIME ZONE 'Europe/Paris')::date AS jour
    FROM held_sessions hs
    JOIN app.attendance_sheets sh ON sh.session_id = hs.id
    CROSS JOIN LATERAL app.attendance_sheet_window(sh.id) w
    LEFT JOIN app.attendance_signatures sig
      ON sig.attendance_sheet_id = sh.id
     AND sig.participant_kind = 'learner' AND sig.learner_id = v_learner
  ),
  heures AS (
    SELECT f.status,
      CASE WHEN f.status IN ('present', 'late', 'remote') THEN
        GREATEST(0, EXTRACT(EPOCH FROM (
          LEAST(f.window_end,
                COALESCE((f.jour + f.early_departure_time) AT TIME ZONE 'Europe/Paris', f.window_end))
          - GREATEST(f.window_start,
                COALESCE((f.jour + f.late_arrival_time) AT TIME ZONE 'Europe/Paris', f.window_start))
        )) / 3600.0)
      ELSE 0 END AS h
    FROM feuilles f
  )
  SELECT
    COALESCE(sum(h), 0),
    COUNT(*) FILTER (WHERE status = 'absent'),
    COUNT(*) FILTER (WHERE status = 'absent_justified')
  INTO v_attended, v_abs, v_abs_j
  FROM heures;

  v_projected := v_attended + CASE WHEN v_aband IS NOT NULL THEN 0 ELSE v_remaining END;
  v_rate := CASE WHEN v_delivered > 0 THEN LEAST(100, round(v_attended / v_delivered * 100, 2)) ELSE 0 END;
  v_at_risk := v_projected < v_total;

  SELECT at_risk INTO v_was_at_risk FROM app.dossier_hours_tracking WHERE dossier_id = p_dossier_id;

  INSERT INTO app.dossier_hours_tracking AS h (
    dossier_id, organization_id, hours_planned, hours_delivered, hours_attended,
    hours_remaining_planned, projected_final_hours, attendance_rate, sessions_held,
    absences_count, justified_absences_count, at_risk, computed_at
  ) VALUES (
    p_dossier_id, v_org, COALESCE(v_total, 0), v_delivered, round(v_attended, 2), v_remaining, round(v_projected, 2),
    v_rate, v_held, v_abs, v_abs_j, COALESCE(v_at_risk, false), now()
  )
  ON CONFLICT (dossier_id) DO UPDATE SET
    hours_planned = EXCLUDED.hours_planned, hours_delivered = EXCLUDED.hours_delivered,
    hours_attended = EXCLUDED.hours_attended, hours_remaining_planned = EXCLUDED.hours_remaining_planned,
    projected_final_hours = EXCLUDED.projected_final_hours, attendance_rate = EXCLUDED.attendance_rate,
    sessions_held = EXCLUDED.sessions_held, absences_count = EXCLUDED.absences_count,
    justified_absences_count = EXCLUDED.justified_absences_count, at_risk = EXCLUDED.at_risk,
    computed_at = now();

  IF v_at_risk AND COALESCE(v_was_at_risk, false) = false THEN
    INSERT INTO app.notifications (organization_id, channel, template_code, subject,
      payload, related_aggregate_type, related_aggregate_id)
    VALUES (v_org, 'in_app', 'dossier_hours_at_risk',
      'Dossier à risque de sous-volume',
      jsonb_build_object('dossier_id', p_dossier_id, 'projected', v_projected, 'planned', v_total),
      'dossier', p_dossier_id);
  END IF;
END $$;

-- ── 2. Recalcul immédiat à chaque signature ou marquage ─────────────────────
CREATE OR REPLACE FUNCTION app.tg_attendance_recompute_hours()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = app, public
AS $$
DECLARE
  v_session UUID;
  d RECORD;
BEGIN
  IF NEW.participant_kind <> 'learner' OR NEW.learner_id IS NULL THEN RETURN NEW; END IF;
  SELECT sh.session_id INTO v_session FROM app.attendance_sheets sh WHERE sh.id = NEW.attendance_sheet_id;
  IF v_session IS NULL THEN RETURN NEW; END IF;

  FOR d IN
    SELECT dd.id FROM app.dossiers dd
    WHERE dd.learner_id = NEW.learner_id
      AND dd.id IN (SELECT sd.dossier_id FROM app.session_dossiers sd WHERE sd.session_id = v_session)
  LOOP
    PERFORM app.recompute_dossier_hours(d.id);
  END LOOP;
  RETURN NEW;
END $$;

REVOKE ALL ON FUNCTION app.tg_attendance_recompute_hours() FROM PUBLIC;

DROP TRIGGER IF EXISTS tg_attendance_sig_hours_dirty ON app.attendance_signatures;
CREATE TRIGGER tg_attendance_sig_hours_dirty
  AFTER INSERT OR UPDATE OF status, late_arrival_time, early_departure_time ON app.attendance_signatures
  FOR EACH ROW EXECUTE FUNCTION app.tg_attendance_recompute_hours();

-- ── 3. RGPD : effacer les données techniques reste permis après clôture ─────
CREATE OR REPLACE FUNCTION app.tg_attendance_signature_immutable()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_sheet_status TEXT;
  -- Données effaçables, plus `participant_id` : colonne générée, encore NULL
  -- dans NEW au moment d'un déclencheur BEFORE — elle fausserait la comparaison.
  v_pii CONSTANT TEXT[] := ARRAY['signer_ip', 'signer_user_agent', 'signer_country',
                                 'exit_signer_ip', 'exit_signer_user_agent', 'notes', 'participant_id'];
BEGIN
  SELECT status INTO v_sheet_status
    FROM app.attendance_sheets
   WHERE id = COALESCE(NEW.attendance_sheet_id, OLD.attendance_sheet_id);

  IF v_sheet_status = 'finalized' THEN
    -- Seul effacement admis : IP, navigateur, pays, notes, passés à NULL
    -- (purge à 5 ans, anonymisation). La preuve elle-même ne bouge pas.
    IF TG_OP = 'UPDATE'
       AND (to_jsonb(NEW) - v_pii) = (to_jsonb(OLD) - v_pii)
       AND (NEW.signer_ip IS NULL OR NEW.signer_ip IS NOT DISTINCT FROM OLD.signer_ip)
       AND (NEW.signer_user_agent IS NULL OR NEW.signer_user_agent IS NOT DISTINCT FROM OLD.signer_user_agent)
       AND (NEW.signer_country IS NULL OR NEW.signer_country IS NOT DISTINCT FROM OLD.signer_country)
       AND (NEW.exit_signer_ip IS NULL OR NEW.exit_signer_ip IS NOT DISTINCT FROM OLD.exit_signer_ip)
       AND (NEW.exit_signer_user_agent IS NULL OR NEW.exit_signer_user_agent IS NOT DISTINCT FROM OLD.exit_signer_user_agent)
       AND (NEW.notes IS NULL OR NEW.notes IS NOT DISTINCT FROM OLD.notes) THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION USING ERRCODE = 'P0010',
      MESSAGE = 'attendance_signature_parent_finalized : feuille clôturée, modification interdite';
  END IF;

  RETURN COALESCE(NEW, OLD);
END $$;

-- Le verrou des feuilles (0033) combinait un texte et l'option MESSAGE dans
-- ses RAISE, ce que PostgreSQL refuse à l'exécution : la modification était
-- bien bloquée, mais par une erreur de syntaxe au lieu du code P0010.
CREATE OR REPLACE FUNCTION app.tg_attendance_sheet_immutable()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' AND OLD.status = 'finalized' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0010',
      MESSAGE = format('attendance_sheet_finalized : feuille %s clôturée, suppression interdite', OLD.id);
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.status = 'finalized' THEN
    -- Seul le rattachement initial du PDF (document_id NULL → non NULL) est admis.
    IF OLD.document_id IS NULL AND NEW.document_id IS NOT NULL
       AND OLD.status = NEW.status
       AND OLD.finalized_at IS NOT DISTINCT FROM NEW.finalized_at
       AND OLD.finalized_by IS NOT DISTINCT FROM NEW.finalized_by THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION USING ERRCODE = 'P0010',
      MESSAGE = format('attendance_sheet_finalized : feuille %s clôturée, modification interdite', OLD.id);
  END IF;

  RETURN COALESCE(NEW, OLD);
END $$;

-- Effacer les données techniques de l'entrée efface aussi celles de la sortie
-- (l'anonymisation 0087 ne connaît pas les colonnes de sortie).
CREATE OR REPLACE FUNCTION app.tg_attendance_signature_pii_sync()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF (OLD.signer_ip IS NOT NULL AND NEW.signer_ip IS NULL)
     OR (OLD.signer_user_agent IS NOT NULL AND NEW.signer_user_agent IS NULL) THEN
    NEW.exit_signer_ip := NULL;
    NEW.exit_signer_user_agent := NULL;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS tg_attendance_signature_pii_sync ON app.attendance_signatures;
CREATE TRIGGER tg_attendance_signature_pii_sync
  BEFORE UPDATE OF signer_ip, signer_user_agent ON app.attendance_signatures
  FOR EACH ROW EXECUTE FUNCTION app.tg_attendance_signature_pii_sync();

-- Purge à 5 ans : colonnes de sortie comprises.
DO $do$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'cron') THEN
    PERFORM cron.schedule(
      'attendance_purge_ip_yearly',
      '0 4 1 * *',
      $cron$
        UPDATE app.attendance_signatures
           SET signer_ip = NULL, signer_user_agent = NULL, signer_country = NULL,
               exit_signer_ip = NULL, exit_signer_user_agent = NULL
         WHERE signed_at < now() - interval '5 years'
           AND (signer_ip IS NOT NULL OR signer_user_agent IS NOT NULL OR signer_country IS NOT NULL
                OR exit_signer_ip IS NOT NULL OR exit_signer_user_agent IS NOT NULL);
      $cron$
    );
  END IF;
END $do$;

-- ── 4. Suivi des heures : lecture seule pour les membres ────────────────────
-- Les écritures passent par `recompute_dossier_hours` (SECURITY DEFINER) et le
-- service role ; un membre ne doit pas pouvoir y inscrire d'heures.
DROP POLICY IF EXISTS dossier_hours_tracking_rw ON app.dossier_hours_tracking;
DROP POLICY IF EXISTS dossier_hours_tracking_select ON app.dossier_hours_tracking;
CREATE POLICY dossier_hours_tracking_select ON app.dossier_hours_tracking
  FOR SELECT TO authenticated
  USING (organization_id = app.current_organization_id());

-- ── 5. Heures recalculées pour tous les dossiers ────────────────────────────
DO $$
DECLARE d RECORD;
BEGIN
  FOR d IN SELECT id FROM app.dossiers WHERE deleted_at IS NULL LOOP
    PERFORM app.recompute_dossier_hours(d.id);
  END LOOP;
END $$;

COMMIT;
