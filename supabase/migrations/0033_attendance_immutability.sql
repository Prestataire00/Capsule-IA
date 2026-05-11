-- ============================================================================
-- 0033 — Immutabilité après finalisation (Qualiopi : preuves infalsifiables)
-- ============================================================================
-- Trigger sur attendance_sheets : refuse UPDATE/DELETE si status='finalized',
-- sauf le set initial de document_id (transition open→finalized).
-- Trigger sur attendance_signatures : refuse UPDATE/DELETE si parent finalisé.

CREATE OR REPLACE FUNCTION app.tg_attendance_sheet_immutable()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' AND OLD.status = 'finalized' THEN
    RAISE EXCEPTION 'attendance_sheet_finalized_no_delete'
      USING ERRCODE = 'P0010',
            MESSAGE = format('Feuille %s finalisée : suppression interdite', OLD.id);
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.status = 'finalized' THEN
    -- Autorise uniquement document_id NULL→non-NULL avec tous les autres champs égaux
    IF OLD.document_id IS NULL AND NEW.document_id IS NOT NULL
       AND OLD.status = NEW.status
       AND OLD.finalized_at IS NOT DISTINCT FROM NEW.finalized_at
       AND OLD.finalized_by IS NOT DISTINCT FROM NEW.finalized_by THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'attendance_sheet_finalized_no_update'
      USING ERRCODE = 'P0010',
            MESSAGE = format('Feuille %s finalisée : modification interdite', OLD.id);
  END IF;

  RETURN COALESCE(NEW, OLD);
END $$;

CREATE TRIGGER tg_attendance_sheet_immutable
  BEFORE UPDATE OR DELETE ON app.attendance_sheets
  FOR EACH ROW EXECUTE FUNCTION app.tg_attendance_sheet_immutable();

CREATE OR REPLACE FUNCTION app.tg_attendance_signature_immutable()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_sheet_status TEXT;
BEGIN
  SELECT status INTO v_sheet_status
    FROM app.attendance_sheets
   WHERE id = COALESCE(NEW.attendance_sheet_id, OLD.attendance_sheet_id);

  IF v_sheet_status = 'finalized' THEN
    RAISE EXCEPTION 'attendance_signature_parent_finalized'
      USING ERRCODE = 'P0010',
            MESSAGE = 'Signature parent finalisée : modification interdite';
  END IF;

  RETURN COALESCE(NEW, OLD);
END $$;

CREATE TRIGGER tg_attendance_signature_immutable
  BEFORE UPDATE OR DELETE ON app.attendance_signatures
  FOR EACH ROW EXECUTE FUNCTION app.tg_attendance_signature_immutable();
