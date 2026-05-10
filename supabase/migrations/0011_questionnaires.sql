-- ============================================================================
-- 0011 — Questionnaires (templates, assignments, responses)
-- ============================================================================

CREATE TABLE app.questionnaire_templates (
  id UUID PRIMARY KEY DEFAULT uuidv7(),
  organization_id UUID REFERENCES app.organizations(id) ON DELETE CASCADE,
  kind app.questionnaire_kind NOT NULL,
  code TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  schema JSONB NOT NULL,
  thank_you_message TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  is_system BOOLEAN GENERATED ALWAYS AS (organization_id IS NULL) STORED,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ NULL,
  UNIQUE (organization_id, code)
);

CREATE TABLE app.questionnaire_assignments (
  id UUID PRIMARY KEY DEFAULT uuidv7(),
  organization_id UUID NOT NULL REFERENCES app.organizations(id) ON DELETE CASCADE,
  template_id UUID NOT NULL REFERENCES app.questionnaire_templates(id) ON DELETE RESTRICT,
  dossier_id UUID NOT NULL REFERENCES app.dossiers(id) ON DELETE CASCADE,
  recipient_kind TEXT NOT NULL CHECK (recipient_kind IN ('learner', 'trainer', 'company_rep')),
  recipient_learner_id UUID REFERENCES app.learners(id),
  recipient_trainer_id UUID REFERENCES app.trainers(id),
  recipient_email CITEXT,
  recipient_name TEXT,
  due_at TIMESTAMPTZ,
  token_hash TEXT NOT NULL UNIQUE,
  status app.questionnaire_response_status NOT NULL DEFAULT 'pending',
  reminders_sent INT NOT NULL DEFAULT 0,
  last_reminder_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE app.questionnaire_responses (
  id UUID PRIMARY KEY DEFAULT uuidv7(),
  organization_id UUID NOT NULL REFERENCES app.organizations(id) ON DELETE CASCADE,
  assignment_id UUID NOT NULL UNIQUE REFERENCES app.questionnaire_assignments(id) ON DELETE CASCADE,
  template_id UUID NOT NULL REFERENCES app.questionnaire_templates(id) ON DELETE RESTRICT,
  dossier_id UUID NOT NULL REFERENCES app.dossiers(id) ON DELETE CASCADE,
  answers JSONB NOT NULL,
  score NUMERIC(5,2),
  nps INT CHECK (nps IS NULL OR nps BETWEEN 0 AND 10),
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  submitter_ip INET,
  submitter_user_agent TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX ix_q_assignments_dossier ON app.questionnaire_assignments(dossier_id, status);
CREATE INDEX ix_q_assignments_due ON app.questionnaire_assignments(due_at)
  WHERE status IN ('pending', 'in_progress');
CREATE INDEX ix_q_responses_dossier ON app.questionnaire_responses(dossier_id);
CREATE INDEX ix_q_responses_template ON app.questionnaire_responses(template_id, submitted_at DESC);
