-- ============================================================================
-- 0084 — Questionnaire de satisfaction FORMATEUR (F-FOR-10)
-- ============================================================================
-- Le formateur remplit son propre questionnaire en fin de formation (exigence
-- Qualiopi : recueil des appréciations des intervenants). On ajoute une valeur
-- dédiée à l'enum questionnaire_kind ; le template système, l'assignation
-- (recipient_kind='trainer', déjà supporté) et la réponse réutilisent l'infra
-- questionnaire existante (0011). Aucune nouvelle table.

ALTER TYPE app.questionnaire_kind ADD VALUE IF NOT EXISTS 'satisfaction_formateur';
