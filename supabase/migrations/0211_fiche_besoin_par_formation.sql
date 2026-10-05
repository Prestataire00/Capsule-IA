-- Une fiche besoin propre à une formation.
--
-- La fiche de positionnement était la même pour toutes les formations : niveau,
-- objectifs, attentes. Or le besoin se dit dans les termes de la formation —
-- « avez-vous déjà utilisé une IA ? » pour une formation à l'IA. Demande
-- d'Ismael le 2026-10-05 : l'IA adapte la fiche à la formation, et l'organisme
-- la relit et la modifie.
--
-- Un modèle de questionnaire peut donc viser une formation. Sans formation,
-- il vaut pour toutes, comme avant.

ALTER TABLE app.questionnaire_templates
  ADD COLUMN IF NOT EXISTS formation_id UUID REFERENCES app.formations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS ix_questionnaire_templates_formation
  ON app.questionnaire_templates (formation_id) WHERE formation_id IS NOT NULL;

COMMENT ON COLUMN app.questionnaire_templates.formation_id IS
  'Formation que ce modèle vise (fiche besoin adaptée, 0211). NULL = valable pour toutes les formations.';
