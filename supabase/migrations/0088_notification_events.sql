-- 0088_notification_events.sql
-- Notifications in-app pour 4 événements métier (inscription apprenant, document généré,
-- document signé, questionnaire complété) + suivi de lecture + lecture élargie au staff.
-- Chaque trigger est *fail-open* : une notif qui échoue n'interrompt JAMAIS l'opération métier
-- (RAISE WARNING, puis on rend la ligne). Triggers SECURITY DEFINER → l'INSERT contourne la RLS.

-- 1. Suivi de lecture (pastille « non lues »).
ALTER TABLE app.notifications ADD COLUMN IF NOT EXISTS read_at TIMESTAMPTZ NULL;

-- 2. Lecture des notifications élargie à tout le staff (la cloche est un outil staff).
DROP POLICY IF EXISTS notifications_select ON app.notifications;
CREATE POLICY notifications_select ON app.notifications FOR SELECT
USING (
  organization_id = app.current_organization_id()
  AND (app.is_staff() OR app.has_role('comptable'))
);

-- ---------------------------------------------------------------------------
-- Événement 1 : inscription d'un apprenant à une session.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.tg_notify_learner_enrolled()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = app, pg_temp
AS $$
DECLARE
  v_name      text;
  v_title     text;
  v_dossier   uuid;
BEGIN
  SELECT trim(coalesce(l.first_name,'') || ' ' || coalesce(l.last_name,''))
    INTO v_name FROM app.learners l WHERE l.id = NEW.learner_id;
  SELECT s.title, s.dossier_id INTO v_title, v_dossier FROM app.sessions s WHERE s.id = NEW.session_id;

  INSERT INTO app.notifications(organization_id, channel, template_code, subject, payload,
    status, sent_at, related_aggregate_type, related_aggregate_id)
  VALUES (
    NEW.organization_id, 'in_app', 'learner_enrolled',
    'Inscription : ' || nullif(trim(coalesce(v_name,'')), '') || coalesce(' — ' || v_title, ''),
    jsonb_build_object('session_id', NEW.session_id, 'learner_id', NEW.learner_id, 'dossier_id', v_dossier),
    'sent', now(), 'dossier', v_dossier
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'tg_notify_learner_enrolled: %', SQLERRM;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS tg_notify_learner_enrolled ON app.session_participants;
CREATE TRIGGER tg_notify_learner_enrolled
AFTER INSERT ON app.session_participants
FOR EACH ROW WHEN (NEW.participant_kind = 'learner')
EXECUTE FUNCTION app.tg_notify_learner_enrolled();

-- ---------------------------------------------------------------------------
-- Événement 2 : document généré / prêt (status -> 'ready').
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.tg_notify_document_ready()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = app, pg_temp
AS $$
BEGIN
  -- Dédup : sur UPDATE, ne notifie que la transition vers 'ready'.
  IF TG_OP = 'UPDATE' AND OLD.status = 'ready' THEN
    RETURN NEW;
  END IF;

  INSERT INTO app.notifications(organization_id, channel, template_code, subject, payload,
    status, sent_at, related_aggregate_type, related_aggregate_id)
  VALUES (
    NEW.organization_id, 'in_app', 'document_generated',
    'Document généré : ' || coalesce(NEW.title, 'document'),
    jsonb_build_object('document_id', NEW.id, 'kind', NEW.kind, 'dossier_id', NEW.dossier_id),
    'sent', now(), 'dossier', NEW.dossier_id
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'tg_notify_document_ready: %', SQLERRM;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS tg_notify_document_ready ON app.documents;
CREATE TRIGGER tg_notify_document_ready
AFTER INSERT OR UPDATE OF status ON app.documents
FOR EACH ROW WHEN (NEW.status = 'ready')
EXECUTE FUNCTION app.tg_notify_document_ready();

-- ---------------------------------------------------------------------------
-- Événement 3 : document signé (status -> 'signed').
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.tg_notify_document_signed()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = app, pg_temp
AS $$
DECLARE
  v_title   text;
  v_dossier uuid;
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.status = 'signed' THEN
    RETURN NEW;
  END IF;

  SELECT d.title, d.dossier_id INTO v_title, v_dossier FROM app.documents d WHERE d.id = NEW.document_id;

  INSERT INTO app.notifications(organization_id, channel, template_code, subject, payload,
    status, sent_at, related_aggregate_type, related_aggregate_id)
  VALUES (
    NEW.organization_id, 'in_app', 'document_signed',
    'Document signé' || coalesce(' : ' || v_title, '') || coalesce(' (par ' || NEW.signer_name || ')', ''),
    jsonb_build_object('document_id', NEW.document_id, 'dossier_id', v_dossier, 'signer_name', NEW.signer_name),
    'sent', now(), 'dossier', v_dossier
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'tg_notify_document_signed: %', SQLERRM;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS tg_notify_document_signed ON app.document_signatures;
CREATE TRIGGER tg_notify_document_signed
AFTER INSERT OR UPDATE OF status ON app.document_signatures
FOR EACH ROW WHEN (NEW.status = 'signed')
EXECUTE FUNCTION app.tg_notify_document_signed();

-- ---------------------------------------------------------------------------
-- Événement 4 : questionnaire complété (réponse soumise).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.tg_notify_questionnaire_completed()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = app, pg_temp
AS $$
DECLARE
  v_title     text;
  v_recipient text;
BEGIN
  SELECT t.title INTO v_title FROM app.questionnaire_templates t WHERE t.id = NEW.template_id;
  SELECT a.recipient_name INTO v_recipient FROM app.questionnaire_assignments a WHERE a.id = NEW.assignment_id;

  INSERT INTO app.notifications(organization_id, channel, template_code, subject, payload,
    status, sent_at, related_aggregate_type, related_aggregate_id)
  VALUES (
    NEW.organization_id, 'in_app', 'questionnaire_completed',
    'Questionnaire complété' || coalesce(' : ' || v_title, '') || coalesce(' (par ' || v_recipient || ')', ''),
    jsonb_build_object('response_id', NEW.id, 'dossier_id', NEW.dossier_id, 'template_id', NEW.template_id),
    'sent', now(), 'dossier', NEW.dossier_id
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'tg_notify_questionnaire_completed: %', SQLERRM;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS tg_notify_questionnaire_completed ON app.questionnaire_responses;
CREATE TRIGGER tg_notify_questionnaire_completed
AFTER INSERT ON app.questionnaire_responses
FOR EACH ROW
EXECUTE FUNCTION app.tg_notify_questionnaire_completed();
