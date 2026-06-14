-- ============================================================================
-- 0073 — Garde-fou : suppression interdite si convention signée (archivage only)
--
-- Règle Qualiopi : un dossier ayant une convention signée ne peut plus être
-- supprimé. Seul l'archivage (transition status → 'archived', sans deleted_at)
-- est autorisé.
--
-- Chemins couverts :
--   [NOMINAL] Soft-delete : UPDATE dossiers SET deleted_at = now()
--             → BEFORE UPDATE trigger
--   [DÉFENSE] Hard-delete : DELETE FROM dossiers
--             → BEFORE DELETE trigger (l'UI ne l'expose pas encore,
--               mais tout DELETE direct SQL/service_role est également bloqué)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Fonction commune : vérifie l'existence d'une convention signée pour un dossier
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.guard_dossier_no_delete_if_signed()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
  -- ── Chemin 1 : Hard DELETE ─────────────────────────────────────────────────
  IF TG_OP = 'DELETE' THEN
    IF EXISTS (
      SELECT 1
      FROM app.documents d
      JOIN app.document_signatures s ON s.document_id = d.id
      WHERE d.dossier_id = OLD.id
        AND d.kind       = 'convention'
        AND s.status     = 'signed'
    ) THEN
      RAISE EXCEPTION
        'Suppression interdite : dossier % a une convention signée. Archivage uniquement (status=archived).',
        OLD.reference
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN OLD;
  END IF;

  -- ── Chemin 2 : Soft DELETE (UPDATE … SET deleted_at = <non-null>) ──────────
  IF TG_OP = 'UPDATE' THEN
    IF NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL THEN
      IF EXISTS (
        SELECT 1
        FROM app.documents d
        JOIN app.document_signatures s ON s.document_id = d.id
        WHERE d.dossier_id = OLD.id
          AND d.kind       = 'convention'
          AND s.status     = 'signed'
      ) THEN
        RAISE EXCEPTION
          'Suppression interdite : dossier % a une convention signée. Archivage uniquement (status=archived).',
          OLD.reference
          USING ERRCODE = 'check_violation';
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  RETURN NULL;
END;
$$;

-- ----------------------------------------------------------------------------
-- Trigger BEFORE DELETE (défense en profondeur — bloque tout DELETE SQL direct)
-- ----------------------------------------------------------------------------
DROP TRIGGER IF EXISTS tg_dossier_no_delete_if_signed ON app.dossiers;
CREATE TRIGGER tg_dossier_no_delete_if_signed
BEFORE DELETE ON app.dossiers
FOR EACH ROW
EXECUTE FUNCTION app.guard_dossier_no_delete_if_signed();

-- ----------------------------------------------------------------------------
-- Trigger BEFORE UPDATE (chemin nominal de l'app : soft-delete via deleted_at)
-- ----------------------------------------------------------------------------
DROP TRIGGER IF EXISTS tg_dossier_no_soft_delete_if_signed ON app.dossiers;
CREATE TRIGGER tg_dossier_no_soft_delete_if_signed
BEFORE UPDATE ON app.dossiers
FOR EACH ROW
EXECUTE FUNCTION app.guard_dossier_no_delete_if_signed();
