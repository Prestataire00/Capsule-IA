-- ============================================================================
-- 0070 — Garde-fou suppression dossier : interdiction si convention signée
-- ============================================================================
-- Règle métier (traçabilité Qualiopi) : un dossier ayant généré une convention
-- SIGNÉE ne peut plus être supprimé — ni hard DELETE, ni soft-delete (passage
-- de deleted_at à non-NULL). Seul l'archivage (status='archived'), géré par la
-- machine à états app.guard_dossier_transitions (0015), reste autorisé.
--
-- "Convention signée" = ≥1 signature status='signed' sur un document
-- kind='convention' du dossier (dès la 1re signature). Cf. 0009_documents.
--
-- La fonction de détection est SECURITY DEFINER : le garde-fou ne doit pas
-- pouvoir être contourné par la visibilité RLS du rôle appelant (ex. un acteur
-- qui ne "voit" pas les signatures ne doit pas pour autant pouvoir supprimer).
-- ============================================================================

CREATE OR REPLACE FUNCTION app.dossier_has_signed_convention(p_dossier_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, app, public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM app.documents d
    JOIN app.document_signatures s ON s.document_id = d.id
    WHERE d.dossier_id = p_dossier_id
      AND d.kind = 'convention'
      AND s.status = 'signed'
  );
$$;

COMMENT ON FUNCTION app.dossier_has_signed_convention(UUID) IS
  'TRUE si le dossier a ≥1 convention (documents.kind=convention) avec ≥1 signature status=signed. Base du garde-fou suppression Qualiopi (0070).';

CREATE OR REPLACE FUNCTION app.guard_dossier_no_delete_signed()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Hard DELETE : interdit dès qu'une convention signée existe.
  IF TG_OP = 'DELETE' THEN
    IF app.dossier_has_signed_convention(OLD.id) THEN
      RAISE EXCEPTION
        'Dossier % : suppression interdite (convention signée) — archivage uniquement (status=archived).',
        OLD.reference
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN OLD;
  END IF;

  -- Soft-delete : passage de deleted_at NULL -> non NULL.
  IF TG_OP = 'UPDATE' AND OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
    IF app.dossier_has_signed_convention(NEW.id) THEN
      RAISE EXCEPTION
        'Dossier % : suppression (deleted_at) interdite (convention signée) — archivage uniquement (status=archived).',
        NEW.reference
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION app.guard_dossier_no_delete_signed() IS
  'Trigger : bloque DELETE et soft-delete (deleted_at) d''un dossier à convention signée. Archivage seul autorisé.';

DROP TRIGGER IF EXISTS tg_dossier_no_delete_signed ON app.dossiers;
CREATE TRIGGER tg_dossier_no_delete_signed
BEFORE DELETE OR UPDATE OF deleted_at ON app.dossiers
FOR EACH ROW EXECUTE FUNCTION app.guard_dossier_no_delete_signed();
