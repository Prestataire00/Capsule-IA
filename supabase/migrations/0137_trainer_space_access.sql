-- 0137 — Couper l'accès à l'espace d'un formateur, depuis sa fiche.
--
-- Il n'existait aucun moyen de retirer l'accès à un formateur sans supprimer sa
-- fiche — donc son historique, ses contrats et ses rattachements. Un organisme
-- doit pouvoir fermer l'espace d'un intervenant dont la mission s'achève, tout
-- en conservant sa trace (audit CAP-30).
--
-- `space_disabled_at` est nul tant que l'accès est ouvert. Une date le ferme :
-- la fiche reste intacte, l'espace se referme, et rouvrir se fait en remettant
-- la colonne à nul.

ALTER TABLE app.trainers
  ADD COLUMN IF NOT EXISTS space_disabled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS space_disabled_by UUID REFERENCES app.members(id) ON DELETE SET NULL;

COMMENT ON COLUMN app.trainers.space_disabled_at IS
  'Date de fermeture de l''espace formateur. NULL = accès ouvert (audit CAP-30).';

-- La RPC qui liste les rattachements d'un formateur alimente son espace : elle
-- doit ignorer les fiches dont l'accès est fermé, sans quoi la fermeture ne
-- vaudrait que pour l'affichage.
CREATE OR REPLACE FUNCTION app.list_my_trainer_memberships()
RETURNS TABLE (
  organization_id   UUID,
  organization_name TEXT,
  trainer_id        UUID,
  first_name        TEXT,
  last_name         TEXT,
  is_internal       BOOLEAN
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = app, public
AS $$
  SELECT
    t.organization_id,
    o.name,
    t.id,
    t.first_name,
    t.last_name,
    t.is_internal
  FROM app.trainers t
  JOIN app.organizations o ON o.id = t.organization_id
  WHERE t.user_id = auth.uid()
    AND t.deleted_at IS NULL
    AND t.space_disabled_at IS NULL
    AND o.deleted_at IS NULL
  ORDER BY o.name;
$$;

GRANT EXECUTE ON FUNCTION app.list_my_trainer_memberships() TO authenticated;

NOTIFY pgrst, 'reload schema';
