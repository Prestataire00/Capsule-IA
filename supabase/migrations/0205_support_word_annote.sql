-- ============================================================================
-- 0205 — Support PDF converti en Word, et sa version annotée par l'équipe
-- ============================================================================
-- Un support déposé en PDF ne s'annote pas dans la plateforme : l'équipe le
-- récupère converti en Word (gardé ici pour ne pas le reconvertir à chaque
-- fois), l'annote dans Word, puis dépose la version annotée que le formateur
-- télécharge. Ces fichiers restent dans le bucket privé `pedagogical` et ne
-- sont jamais montrés aux stagiaires : seuls les chemins sont notés ici.
-- ============================================================================

ALTER TABLE app.session_resources
  ADD COLUMN IF NOT EXISTS word_path      TEXT,
  ADD COLUMN IF NOT EXISTS annotated_path TEXT,
  ADD COLUMN IF NOT EXISTS annotated_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS annotated_by   UUID REFERENCES auth.users(id) ON DELETE SET NULL;

COMMENT ON COLUMN app.session_resources.word_path IS
  'Conversion Word du PDF déposé, pour l''annoter (0205). Interne : jamais servie aux stagiaires.';
COMMENT ON COLUMN app.session_resources.annotated_path IS
  'Version annotée déposée par l''équipe pédagogique, à l''intention du formateur (0205).';
