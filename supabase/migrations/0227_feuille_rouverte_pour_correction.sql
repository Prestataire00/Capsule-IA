-- Corriger une feuille d'émargement clôturée (demande d'Ismael le 2026-10-08 :
-- « si je modifie une présence, la feuille PDF doit se mettre à jour »).
--
-- La feuille clôturée reste verrouillée (0033, 0146) : seule cette fonction la
-- rouvre, avec un motif, une trace dans le journal d'audit et le PDF précédent
-- conservé (son document n'est ni modifié ni supprimé). L'application corrige
-- la présence puis reclôt aussitôt : un nouveau PDF, une nouvelle version.

CREATE OR REPLACE FUNCTION app.tg_attendance_sheet_immutable()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' AND OLD.status = 'finalized' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0010',
      MESSAGE = format('attendance_sheet_finalized : feuille %s clôturée, suppression interdite', OLD.id);
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.status = 'finalized' THEN
    -- Seul le rattachement initial du PDF (document_id NULL → non NULL) est admis.
    IF OLD.document_id IS NULL AND NEW.document_id IS NOT NULL
       AND OLD.status = NEW.status
       AND OLD.finalized_at IS NOT DISTINCT FROM NEW.finalized_at
       AND OLD.finalized_by IS NOT DISTINCT FROM NEW.finalized_by THEN
      RETURN NEW;
    END IF;
    -- Réouverture pour correction : par app.rouvrir_feuille_pour_correction seulement.
    IF current_setting('app.correction_feuille', true) = 'on' AND NEW.status = 'open' THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION USING ERRCODE = 'P0010',
      MESSAGE = format('attendance_sheet_finalized : feuille %s clôturée, modification interdite', OLD.id);
  END IF;

  RETURN COALESCE(NEW, OLD);
END $$;

CREATE OR REPLACE FUNCTION app.rouvrir_feuille_pour_correction(p_sheet_id UUID, p_actor UUID, p_motif TEXT)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = app, pg_temp
AS $$
DECLARE
  v_sheet RECORD;
BEGIN
  IF char_length(btrim(COALESCE(p_motif, ''))) < 3 THEN
    RAISE EXCEPTION 'reason_required' USING ERRCODE = 'P0001';
  END IF;
  SELECT id, organization_id, status, document_id, finalized_at, finalized_by
    INTO v_sheet FROM app.attendance_sheets WHERE id = p_sheet_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'attendance_sheet_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF v_sheet.status <> 'finalized' THEN
    RAISE EXCEPTION 'attendance_sheet_not_finalized' USING ERRCODE = 'P0001';
  END IF;

  PERFORM set_config('app.correction_feuille', 'on', true);
  UPDATE app.attendance_sheets
     SET status = 'open', finalized_at = NULL, finalized_by = NULL, document_id = NULL
   WHERE id = p_sheet_id;
  PERFORM set_config('app.correction_feuille', 'off', true);

  INSERT INTO audit.audit_log (organization_id, actor_user_id, schema_name, table_name, row_id, action, before, after)
  VALUES (
    -- Le journal n'admet que insert/update/delete : l'évènement est dit dans `after`.
    v_sheet.organization_id, p_actor, 'app', 'attendance_sheets', p_sheet_id, 'update',
    jsonb_build_object('document_id', v_sheet.document_id, 'finalized_at', v_sheet.finalized_at, 'finalized_by', v_sheet.finalized_by),
    jsonb_build_object('evenement', 'reouverture_pour_correction', 'motif', btrim(p_motif))
  );
END;
$$;

REVOKE ALL ON FUNCTION app.rouvrir_feuille_pour_correction(UUID, UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.rouvrir_feuille_pour_correction(UUID, UUID, TEXT) TO service_role;
