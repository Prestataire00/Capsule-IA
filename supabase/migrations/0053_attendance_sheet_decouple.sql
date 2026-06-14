-- ============================================================================
-- 0053 — Feuille d'émargement partageable + source de participant
-- ============================================================================

-- Une feuille partagée couvre les apprenants de plusieurs dossiers : le dossier
-- n'est plus obligatoire (contexte dérivé par apprenant via session_dossiers).
ALTER TABLE app.attendance_sheets ALTER COLUMN dossier_id DROP NOT NULL;

-- Origine d'un participant de session : dérivé (fenêtre dossier) ou override.
CREATE TYPE app.participant_source AS ENUM ('derived', 'manual_add', 'manual_remove');

-- L'existant a été saisi à la main → 'manual_add'.
ALTER TABLE app.session_participants
  ADD COLUMN source app.participant_source NOT NULL DEFAULT 'manual_add';
