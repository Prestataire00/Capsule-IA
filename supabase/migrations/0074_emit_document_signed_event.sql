-- ============================================================================
-- 0074 — Trigger outbox : émet document.signed quand un document est signé
-- ============================================================================
-- Contexte : app.document_signatures.status passe à 'signed' quand un
-- signataire valide sa signature sur un document (convention, etc.).
-- Ce trigger émet un event domain_events pour permettre aux handlers outbox
-- de réagir (ex. transition dossier draft/pending_validation → scheduled
-- quand la convention est signée — cf. dispatch-events/route.ts).
--
-- Payload :
--   document_id  — id du document signé
--   dossier_id   — id du dossier associé (nullable si document non lié)
--   kind         — kind du document (convention, convocation…)
--   signer_kind  — learner | trainer | company_rep | org_rep
-- ============================================================================

CREATE OR REPLACE FUNCTION app.tg_emit_document_signed()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, infra, public
AS $$
DECLARE
  v_org_id    UUID;
  v_dossier_id UUID;
  v_kind      TEXT;
BEGIN
  -- On ne réagit que lorsque le statut devient 'signed'
  IF NEW.status <> 'signed' THEN
    RETURN NEW;
  END IF;
  -- Idempotence : si le statut était déjà 'signed' avant, on ne réémet pas
  IF TG_OP = 'UPDATE' AND OLD.status = 'signed' THEN
    RETURN NEW;
  END IF;

  -- Récupère org_id, dossier_id et kind depuis app.documents
  SELECT d.organization_id, d.dossier_id, d.kind
    INTO v_org_id, v_dossier_id, v_kind
    FROM app.documents d
   WHERE d.id = NEW.document_id;

  IF v_org_id IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO infra.domain_events (
    organization_id, aggregate_type, aggregate_id, type, payload
  ) VALUES (
    v_org_id,
    'document_signature',
    NEW.id,
    'document.signed',
    jsonb_build_object(
      'document_id',  NEW.document_id,
      'dossier_id',   v_dossier_id,
      'kind',         v_kind,
      'signer_kind',  NEW.signer_kind
    )
  );

  RETURN NEW;
END;
$$;

-- Trigger AFTER INSERT OR UPDATE OF status
-- INSERT : signature directe en 'signed' (ex. via admin / batch)
-- UPDATE : passage de pending → signed
DROP TRIGGER IF EXISTS tg_document_signatures_emit_signed ON app.document_signatures;
CREATE TRIGGER tg_document_signatures_emit_signed
AFTER INSERT OR UPDATE OF status ON app.document_signatures
FOR EACH ROW
EXECUTE FUNCTION app.tg_emit_document_signed();
