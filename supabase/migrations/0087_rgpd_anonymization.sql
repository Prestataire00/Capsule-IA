-- 0087_rgpd_anonymization.sql
-- Droit à l'effacement RGPD : anonymisation en place (apprenants + prospects).
-- Scrub des identifiants directs + métadonnées de surveillance ; conservation des
-- enregistrements à valeur légale (émargements, conventions) pseudonymisés.
-- ERRCODE custom : P0401 (forbidden), P0404 (not found / autre org), P0409 (dossier actif).
-- Limite connue : le scrub de app.email_log / app.notifications se fait par correspondance
-- de valeur (email courant de la personne), pas par FK. Des lignes adressées à un ancien
-- email (si l'adresse a changé) peuvent subsister. Garde l'org scoping = prédicat du SELECT
-- (app.is_admin_or_owner() ne vérifie que le rôle, pas l'org).
-- Audit : on écrit une ligne explicite marquée diff.reason='rgpd_erasure'. Le trigger générique
-- tg_audit (0015) journalise EN PLUS le diff structurel de l'UPDATE learners (donc 2 lignes :
-- 1 sémantique RGPD + 1 diff). Conséquence assumée : le journal d'audit conserve l'identité
-- d'avant effacement — volontaire (preuve d'accountability, art. 17.3 RGPD ; audit.audit_log
-- est admin-only et append-only).

ALTER TABLE app.prospects ADD COLUMN IF NOT EXISTS anonymized_at TIMESTAMPTZ NULL;

CREATE OR REPLACE FUNCTION app.anonymize_learner(p_learner_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, audit, pg_temp
AS $$
DECLARE
  v_org        UUID;
  v_user_id    UUID;
  v_old_email  CITEXT;
  v_already    TIMESTAMPTZ;
  v_paths      TEXT[] := '{}';
  v_before     JSONB;
BEGIN
  IF NOT app.is_admin_or_owner() THEN
    RAISE EXCEPTION 'forbidden: admin/owner requis' USING ERRCODE = 'P0401';
  END IF;

  SELECT organization_id, user_id, email, anonymized_at
    INTO v_org, v_user_id, v_old_email, v_already
  FROM app.learners
  WHERE id = p_learner_id
    AND organization_id = app.current_organization_id()
    AND deleted_at IS NULL
  FOR UPDATE;  -- verrou ligne : ferme la fenêtre TOCTOU du garde dossier-actif + sérialise les appels concurrents

  IF NOT FOUND THEN
    RAISE EXCEPTION 'not found' USING ERRCODE = 'P0404';
  END IF;

  IF v_already IS NOT NULL THEN
    RETURN jsonb_build_object('status', 'already_anonymized', 'anonymized_at', v_already);
  END IF;

  IF EXISTS (
    SELECT 1 FROM app.dossiers
    WHERE learner_id = p_learner_id AND status = 'active' AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'active dossier' USING ERRCODE = 'P0409';
  END IF;

  SELECT to_jsonb(l) - 'metadata' INTO v_before FROM app.learners l WHERE l.id = p_learner_id;

  SELECT array_agg(file_path) INTO v_paths
  FROM app.exercise_submissions
  WHERE learner_id = p_learner_id AND file_path IS NOT NULL;

  UPDATE app.learners SET
    first_name          = 'Apprenant',
    last_name           = 'anonymisé #' || substr(id::text, 1, 8),
    email               = ('anon+' || id::text || '@anonymized.invalid')::citext,
    phone               = NULL,
    birth_date          = NULL,
    birth_place         = NULL,
    nationality         = NULL,
    gender              = NULL,
    address             = '{}'::jsonb,
    position            = NULL,
    education_level     = NULL,
    cpf_number          = NULL,
    rqth                = false,
    accessibility_notes = NULL,
    notes               = NULL,
    tags                = '{}',
    metadata            = '{}'::jsonb,
    user_id             = NULL,
    anonymized_at       = now(),
    updated_at          = now()
  WHERE id = p_learner_id;

  UPDATE app.attendance_signatures SET
    signer_ip         = NULL,
    signer_user_agent = NULL,
    signer_country    = NULL,
    notes             = NULL
  WHERE learner_id = p_learner_id;

  UPDATE app.document_signatures SET
    signer_ip         = NULL,
    signer_user_agent = NULL
  WHERE signer_learner_id = p_learner_id;

  UPDATE app.questionnaire_assignments SET
    recipient_email = NULL,
    recipient_name  = NULL
  WHERE recipient_learner_id = p_learner_id;

  UPDATE app.questionnaire_responses SET
    submitter_ip         = NULL,
    submitter_user_agent = NULL
  WHERE assignment_id IN (
    SELECT id FROM app.questionnaire_assignments WHERE recipient_learner_id = p_learner_id
  );

  UPDATE app.complaints SET
    reporter_name  = NULL,
    reporter_email = NULL
  WHERE learner_id = p_learner_id;

  UPDATE app.resource_access_log SET
    ip         = NULL,
    user_agent = NULL
  WHERE learner_id = p_learner_id;

  IF v_user_id IS NOT NULL THEN
    UPDATE app.document_access_log SET
      ip         = NULL,
      user_agent = NULL
    WHERE actor_user_id = v_user_id;
  END IF;

  UPDATE app.exercise_submissions SET
    content   = COALESCE(content, '(soumission anonymisée)'),
    file_path = NULL
  WHERE learner_id = p_learner_id;

  UPDATE app.email_log SET
    recipient = 'anonymized@anonymized.invalid',
    metadata  = '{}'::jsonb
  WHERE organization_id = v_org AND recipient = v_old_email::text;

  DELETE FROM app.notifications
  WHERE organization_id = v_org
    AND (recipient_email = v_old_email
         OR (v_user_id IS NOT NULL AND recipient_user_id = v_user_id));

  INSERT INTO audit.audit_log(organization_id, actor_user_id, schema_name, table_name, row_id, action, before, after, diff)
  VALUES (
    v_org, app.current_user_id(), 'app', 'learners', p_learner_id, 'update',
    v_before,
    jsonb_build_object('anonymized', true, 'at', now()),
    jsonb_build_object('reason', 'rgpd_erasure')
  );

  RETURN jsonb_build_object('status', 'anonymized', 'storage_paths', to_jsonb(COALESCE(v_paths, '{}')));
END $$;

CREATE OR REPLACE FUNCTION app.anonymize_prospect(p_prospect_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, audit, pg_temp
AS $$
DECLARE
  v_org      UUID;
  v_already  TIMESTAMPTZ;
  v_docs     JSONB;
  v_paths    TEXT[] := '{}';
  v_before   JSONB;
BEGIN
  IF NOT app.is_admin_or_owner() THEN
    RAISE EXCEPTION 'forbidden: admin/owner requis' USING ERRCODE = 'P0401';
  END IF;

  SELECT organization_id, anonymized_at, documents
    INTO v_org, v_already, v_docs
  FROM app.prospects
  WHERE id = p_prospect_id
    AND organization_id = app.current_organization_id()
    AND deleted_at IS NULL
  FOR UPDATE;  -- verrou ligne : sérialise les appels concurrents (idempotence renforcée)

  IF NOT FOUND THEN
    RAISE EXCEPTION 'not found' USING ERRCODE = 'P0404';
  END IF;

  IF v_already IS NOT NULL THEN
    RETURN jsonb_build_object('status', 'already_anonymized', 'anonymized_at', v_already);
  END IF;

  SELECT array_agg(d->>'storage_path') INTO v_paths
  FROM jsonb_array_elements(COALESCE(v_docs, '[]'::jsonb)) d
  WHERE d ? 'storage_path';

  SELECT to_jsonb(p) - 'internal_notes' INTO v_before FROM app.prospects p WHERE p.id = p_prospect_id;

  UPDATE app.prospects SET
    civility       = NULL,
    first_name     = 'Prospect',
    last_name      = 'anonymisé #' || substr(id::text, 1, 8),
    email          = 'anon+' || id::text || '@anonymized.invalid',
    phone          = NULL,
    birth_date     = NULL,
    rqth           = false,
    message        = NULL,
    company_name   = NULL,
    internal_notes = NULL,
    source         = NULL,
    ip_address     = NULL,
    user_agent     = NULL,
    documents      = '[]'::jsonb,
    anonymized_at  = now(),
    updated_at     = now()
  WHERE id = p_prospect_id;

  INSERT INTO audit.audit_log(organization_id, actor_user_id, schema_name, table_name, row_id, action, before, after, diff)
  VALUES (
    v_org, app.current_user_id(), 'app', 'prospects', p_prospect_id, 'update',
    v_before,
    jsonb_build_object('anonymized', true, 'at', now()),
    jsonb_build_object('reason', 'rgpd_erasure')
  );

  RETURN jsonb_build_object('status', 'anonymized', 'storage_paths', to_jsonb(COALESCE(v_paths, '{}')));
END $$;

REVOKE ALL ON FUNCTION app.anonymize_learner(UUID) FROM public;
REVOKE ALL ON FUNCTION app.anonymize_prospect(UUID) FROM public;
GRANT EXECUTE ON FUNCTION app.anonymize_learner(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION app.anonymize_prospect(UUID) TO authenticated;
