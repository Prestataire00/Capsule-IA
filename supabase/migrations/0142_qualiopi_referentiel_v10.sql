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
