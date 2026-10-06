-- ============================================================================
-- 0215 — Replays de séance venant de tl;dv, Lexi ou Meet
-- ============================================================================
-- Audit du point Capsule IA (2026-10-06) : « l'accès au replay des formations
-- via Lexi doit être clarifié ». Les replays ne venaient que de Zoom. Les bots
-- tl;dv et Lexi rejoignent les Meet de la boîte générique et produisent un
-- lien de partage : l'équipe ou le formateur le colle sur la séance, et
-- l'entreprise le retrouve dans son espace.

ALTER TABLE app.session_recordings DROP CONSTRAINT IF EXISTS session_recordings_source_check;
ALTER TABLE app.session_recordings
  ADD CONSTRAINT session_recordings_source_check CHECK (source IN ('zoom', 'manual', 'tldv', 'lexi', 'meet'));

-- Un libellé lisible (« Replay du matin », « Partie 2 ») ; facultatif.
ALTER TABLE app.session_recordings ADD COLUMN IF NOT EXISTS title TEXT CHECK (title IS NULL OR char_length(title) <= 200);

-- Le lien doit être une adresse web : il est ouvert tel quel par l'entreprise.
ALTER TABLE app.session_recordings DROP CONSTRAINT IF EXISTS session_recordings_play_url_web;
ALTER TABLE app.session_recordings
  ADD CONSTRAINT session_recordings_play_url_web CHECK (play_url ~* '^https?://') NOT VALID;
