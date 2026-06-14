-- ============================================================================
-- 0051 — Matrice standard des règles Qualiopi (organization_id NULL).
-- Override possible par OF. Indicateurs dossier-scope seedés dans seed.sql
-- (I4-I15, I20-I23, I26-I27, I30). #10 = positionnement (analyse des besoins).
-- ============================================================================

INSERT INTO app.qualiopi_indicator_rules
  (organization_id, indicator_id, stage, is_blocking, satisfaction_source)
SELECT NULL, i.id, v.stage::app.qualiopi_gate_stage, v.is_blocking,
       v.source::app.qualiopi_satisfaction_source
FROM (VALUES
  -- num, stage,     is_blocking, source
  (4,  'entry',   true,  'proof'),                          -- objectifs
  (5,  'entry',   true,  'proof'),                          -- adaptation parcours
  (6,  'entry',   true,  'proof'),                          -- modalités pédagogiques
  (7,  'entry',   true,  'proof'),                          -- programme détaillé
  (8,  'entry',   true,  'proof'),                          -- modalités d'évaluation
  (9,  'entry',   false, 'proof'),                          -- adaptation pédagogique
  (10, 'entry',   true,  'questionnaire_positionnement'),   -- positionnement (analyse besoins)
  (11, 'entry',   false, 'proof'),                          -- publics spécifiques
  (12, 'none',    false, 'proof'),                          -- accompagnement
  (13, 'entry',   false, 'proof'),                          -- conditions de déroulement
  (14, 'none',    false, 'proof'),                          -- coordination
  (15, 'closing', true,  'proof'),                          -- atteinte des objectifs
  (20, 'entry',   false, 'proof'),                          -- locaux et matériel
  (21, 'entry',   true,  'proof'),                          -- compétences formateurs
  (22, 'closing', true,  'attendance_signed'),              -- traçabilité présences
  (23, 'closing', true,  'questionnaire_evaluation'),       -- évaluation des acquis
  (26, 'closing', false, 'proof'),                          -- satisfaction à chaud
  (27, 'closing', false, 'proof'),                          -- satisfaction à froid
  (30, 'none',    false, 'proof')                           -- dysfonctionnements
) AS v(num, stage, is_blocking, source)
JOIN app.qualiopi_indicators i ON i.number = v.num
ON CONFLICT (organization_id, indicator_id) DO NOTHING;
