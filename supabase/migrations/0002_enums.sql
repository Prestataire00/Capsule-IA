-- ============================================================================
-- 0002 — ENUMs
-- ============================================================================

CREATE TYPE app.member_role AS ENUM (
  'owner', 'admin', 'gestionnaire', 'comptable', 'formateur'
);

CREATE TYPE app.invitation_status AS ENUM (
  'pending', 'accepted', 'expired', 'revoked'
);

CREATE TYPE app.training_modality AS ENUM (
  'presentiel', 'distanciel', 'hybride', 'afest'
);

CREATE TYPE app.dossier_status AS ENUM (
  'draft', 'pending_validation', 'scheduled', 'active',
  'completed', 'closed', 'archived', 'cancelled'
);

CREATE TYPE app.session_status AS ENUM (
  'planned', 'in_progress', 'done', 'cancelled'
);

CREATE TYPE app.attendance_status AS ENUM (
  'present', 'absent', 'absent_justified', 'late', 'remote'
);

CREATE TYPE app.document_status AS ENUM (
  'pending', 'generating', 'ready', 'failed', 'archived'
);

CREATE TYPE app.signature_status AS ENUM (
  'pending', 'signed', 'declined', 'expired'
);

CREATE TYPE app.questionnaire_kind AS ENUM (
  'positionnement', 'satisfaction_chaud', 'satisfaction_froid',
  'opco', 'evaluation_acquis', 'custom'
);

CREATE TYPE app.questionnaire_response_status AS ENUM (
  'pending', 'in_progress', 'completed', 'expired'
);

CREATE TYPE app.complaint_status AS ENUM (
  'open', 'in_progress', 'resolved', 'closed'
);

CREATE TYPE app.invoice_status AS ENUM (
  'draft', 'issued', 'paid', 'partially_paid', 'overdue', 'cancelled'
);

CREATE TYPE app.funder_kind AS ENUM (
  'opco', 'cpf', 'pole_emploi', 'region', 'autofinancement', 'entreprise', 'autre'
);

CREATE TYPE app.qualiopi_indicator_scope AS ENUM (
  'organization', 'dossier'
);

CREATE TYPE app.workflow_run_status AS ENUM (
  'pending', 'running', 'success', 'failed', 'dead_letter'
);
