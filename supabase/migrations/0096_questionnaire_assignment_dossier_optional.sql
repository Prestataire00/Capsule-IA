-- 0096_questionnaire_assignment_dossier_optional.sql
-- La « fiche besoin » (questionnaire de positionnement) peut être envoyée à un
-- apprenant AVANT tout dossier (création directe au dashboard). On rend donc
-- dossier_id facultatif sur les assignations et les réponses de questionnaire.
--
-- RLS inchangée : les policies existantes sont org-scopées
-- (organization_id = app.current_organization_id()), la branche formateur via
-- app.is_dossier_trainer(dossier_id) renvoie simplement false quand dossier_id
-- est NULL (un formateur n'est pas rattaché à un dossier inexistant).

ALTER TABLE app.questionnaire_assignments ALTER COLUMN dossier_id DROP NOT NULL;
ALTER TABLE app.questionnaire_responses ALTER COLUMN dossier_id DROP NOT NULL;

-- Dédup des fiches besoin "hors dossier" par apprenant (anti-doublon).
CREATE INDEX IF NOT EXISTS ix_q_assignments_learner_nodossier
  ON app.questionnaire_assignments (template_id, recipient_learner_id)
  WHERE dossier_id IS NULL AND recipient_learner_id IS NOT NULL;
