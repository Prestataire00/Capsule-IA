-- ============================================================================
-- 0046 — Matérialisation des tâches financeur + déclencheur outbox + kind CCN
-- ============================================================================

-- 1) Nouveau kind de document pour la bibliothèque de conventions collectives.
ALTER TABLE app.document_templates DROP CONSTRAINT IF EXISTS document_templates_kind_check;
ALTER TABLE app.document_templates ADD CONSTRAINT document_templates_kind_check
  CHECK (kind IN (
    'convention', 'convocation', 'programme', 'attestation_presence',
    'attestation_fin', 'certificat_realisation', 'reglement_interieur',
    'livret_accueil', 'devis', 'facture', 'feuille_emargement',
    'questionnaire', 'convention_collective', 'autre'
  ));

-- 2) Résout le playbook applicable (override org > système) et matérialise
--    les tâches avec due_date = ancre(dates dossier) + offset_days.
CREATE OR REPLACE FUNCTION app.materialize_funder_tasks(
  p_dossier_id UUID,
  p_funder_id UUID
) RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
  v_org UUID;
  v_start DATE;
  v_end DATE;
  v_created DATE;
  v_kind app.funder_kind;
  v_playbook UUID;
  v_count INT := 0;
BEGIN
  SELECT d.organization_id, d.start_date, d.end_date, d.created_at::date
    INTO v_org, v_start, v_end, v_created
  FROM app.dossiers d WHERE d.id = p_dossier_id;
  IF v_org IS NULL THEN RETURN 0; END IF;

  SELECT f.kind INTO v_kind
  FROM app.funders f WHERE f.id = p_funder_id AND f.organization_id = v_org;
  IF v_kind IS NULL THEN RETURN 0; END IF;

  SELECT pb.id INTO v_playbook
  FROM app.funder_playbooks pb
  WHERE pb.funder_kind = v_kind
    AND pb.is_active AND pb.deleted_at IS NULL
    AND (pb.organization_id = v_org OR pb.organization_id IS NULL)
  ORDER BY (pb.organization_id IS NOT NULL) DESC
  LIMIT 1;
  IF v_playbook IS NULL THEN RETURN 0; END IF;

  INSERT INTO app.dossier_funder_tasks AS t (
    organization_id, dossier_id, funder_id, playbook_step_id, due_date, status
  )
  SELECT
    v_org, p_dossier_id, p_funder_id, s.id,
    (CASE s.anchor
      WHEN 'dossier_created' THEN v_created
      WHEN 'session_start'   THEN v_start
      WHEN 'session_end'     THEN v_end
      WHEN 'manual'          THEN NULL
    END + (s.offset_days || ' days')::interval)::date,
    'pending'
  FROM app.funder_playbook_steps s
  WHERE s.playbook_id = v_playbook
  ON CONFLICT (dossier_id, funder_id, playbook_step_id) DO UPDATE
    SET due_date = EXCLUDED.due_date, updated_at = now()
    WHERE t.status NOT IN ('sent', 'done');

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END $$;

REVOKE ALL ON FUNCTION app.materialize_funder_tasks(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.materialize_funder_tasks(UUID, UUID) TO service_role;

-- Wrapper public pour exposition PostgREST (appelé par le cron via rpc()).
CREATE OR REPLACE FUNCTION public.materialize_funder_tasks(
  p_dossier_id UUID,
  p_funder_id UUID
) RETURNS INT
LANGUAGE sql
SECURITY DEFINER
SET search_path = app, public
AS $$ SELECT app.materialize_funder_tasks(p_dossier_id, p_funder_id) $$;

REVOKE ALL ON FUNCTION public.materialize_funder_tasks(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.materialize_funder_tasks(UUID, UUID) TO service_role;

-- 3) Trigger : tout rattachement d'un financeur émet un domain_event.
CREATE OR REPLACE FUNCTION app.tg_emit_funder_attached()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, infra, public
AS $$
DECLARE v_org UUID;
BEGIN
  SELECT organization_id INTO v_org FROM app.dossiers WHERE id = NEW.dossier_id;
  INSERT INTO infra.domain_events (
    organization_id, aggregate_type, aggregate_id, type, payload
  ) VALUES (
    v_org, 'dossier', NEW.dossier_id, 'dossier.funder_attached',
    jsonb_build_object('dossier_id', NEW.dossier_id, 'funder_id', NEW.funder_id)
  );
  RETURN NEW;
END $$;

CREATE TRIGGER tg_dossier_funders_emit_attached
AFTER INSERT ON app.dossier_funders
FOR EACH ROW EXECUTE FUNCTION app.tg_emit_funder_attached();
