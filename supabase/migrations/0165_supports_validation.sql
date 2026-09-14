-- Validation des supports de cours par l'administration.
--
-- Un support déposé par un formateur externe partait directement chez les
-- apprenants (0164). L'organisme reste responsable de ce qu'il diffuse — droit
-- d'auteur, exactitude, conformité au programme : rien ne sort sans qu'un
-- propriétaire ou un administrateur l'ait ouvert.
--
-- Trois états, pas plus : en attente (déposé), validé (visible), refusé (avec
-- son motif, pour que le formateur sache quoi corriger).

ALTER TABLE app.session_resources
  ADD COLUMN IF NOT EXISTS validation_status TEXT NOT NULL DEFAULT 'en_attente'
    CHECK (validation_status IN ('en_attente', 'valide', 'refuse')),
  ADD COLUMN IF NOT EXISTS validated_by       UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS validated_at       TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS rejection_reason   TEXT
    CHECK (rejection_reason IS NULL OR length(rejection_reason) <= 1000),
  ADD COLUMN IF NOT EXISTS submitted_at       TIMESTAMPTZ NOT NULL DEFAULT now();

-- La file d'attente de l'administration : le plus ancien dépôt d'abord, un
-- formateur ne doit pas attendre sa validation une semaine.
CREATE INDEX IF NOT EXISTS ix_session_resources_a_valider
  ON app.session_resources (organization_id, submitted_at)
  WHERE deleted_at IS NULL AND validation_status = 'en_attente';

COMMENT ON COLUMN app.session_resources.validation_status IS
  'en_attente | valide | refuse — seul « valide » est diffusé aux apprenants.';
COMMENT ON COLUMN app.session_resources.rejection_reason IS
  'Motif du refus, écrit par l''administrateur et lu par le formateur.';
