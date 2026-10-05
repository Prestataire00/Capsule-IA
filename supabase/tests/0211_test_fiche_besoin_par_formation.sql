-- ============================================================================
-- Tests pgTAP : fiche besoin propre à une formation (0211).
-- ============================================================================
BEGIN;
SELECT plan(3);

SELECT has_column('app', 'questionnaire_templates', 'formation_id', 'un modèle peut viser une formation');
SELECT col_is_null('app', 'questionnaire_templates', 'formation_id', 'sans formation, le modèle vaut pour toutes');
SELECT has_index('app', 'questionnaire_templates', 'ix_questionnaire_templates_formation', 'modèles d''une formation indexés');

SELECT * FROM finish();
ROLLBACK;
