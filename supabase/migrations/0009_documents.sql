-- ============================================================================
-- 0009 — Documents (templates, instances, signatures, access log)
-- ============================================================================

CREATE TABLE app.document_templates (
  id UUID PRIMARY KEY DEFAULT uuidv7(),
  organization_id UUID REFERENCES app.organizations(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN (
    'convention', 'convocation', 'programme', 'attestation_presence',
    'attestation_fin', 'certificat_realisation', 'reglement_interieur',
    'livret_accueil', 'devis', 'facture', 'feuille_emargement',
    'questionnaire', 'autre'
  )),
  code TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  variables_schema JSONB NOT NULL DEFAULT '{}'::jsonb,
  current_version INT NOT NULL DEFAULT 1,
  is_system BOOLEAN GENERATED ALWAYS AS (organization_id IS NULL) STORED,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ NULL,
  UNIQUE (organization_id, code)
);

CREATE TABLE app.document_template_versions (
  id UUID PRIMARY KEY DEFAULT uuidv7(),
  template_id UUID NOT NULL REFERENCES app.document_templates(id) ON DELETE CASCADE,
  organization_id UUID REFERENCES app.organizations(id) ON DELETE CASCADE,
  version INT NOT NULL CHECK (version >= 1),
  storage_path TEXT NOT NULL,
  file_hash TEXT NOT NULL,
  variables_schema JSONB NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id),
  UNIQUE (template_id, version)
);

CREATE TABLE app.documents (
  id UUID PRIMARY KEY DEFAULT uuidv7(),
  organization_id UUID NOT NULL REFERENCES app.organizations(id) ON DELETE CASCADE,
  dossier_id UUID REFERENCES app.dossiers(id) ON DELETE CASCADE,
  template_id UUID REFERENCES app.document_templates(id) ON DELETE SET NULL,
  template_version_id UUID REFERENCES app.document_template_versions(id) ON DELETE SET NULL,
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  status app.document_status NOT NULL DEFAULT 'pending',
  storage_path TEXT,
  mime_type TEXT,
  file_size_bytes BIGINT,
  file_hash TEXT,
  version INT NOT NULL DEFAULT 1,
  parent_document_id UUID REFERENCES app.documents(id) ON DELETE SET NULL,
  generation_input JSONB,
  generation_error TEXT,
  generated_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id),
  deleted_at TIMESTAMPTZ NULL
);

ALTER TABLE app.attendance_sheets
  ADD CONSTRAINT fk_attendance_sheets_document
  FOREIGN KEY (document_id) REFERENCES app.documents(id) ON DELETE SET NULL;

CREATE TABLE app.document_signatures (
  id UUID PRIMARY KEY DEFAULT uuidv7(),
  organization_id UUID NOT NULL REFERENCES app.organizations(id) ON DELETE CASCADE,
  document_id UUID NOT NULL REFERENCES app.documents(id) ON DELETE CASCADE,
  signer_kind TEXT NOT NULL CHECK (signer_kind IN ('learner', 'trainer', 'company_rep', 'org_rep')),
  signer_learner_id UUID REFERENCES app.learners(id),
  signer_trainer_id UUID REFERENCES app.trainers(id),
  signer_user_id UUID REFERENCES auth.users(id),
  signer_email CITEXT,
  signer_name TEXT,
  status app.signature_status NOT NULL DEFAULT 'pending',
  request_token_hash TEXT UNIQUE,
  request_expires_at TIMESTAMPTZ,
  signed_at TIMESTAMPTZ,
  signer_ip INET,
  signer_user_agent TEXT,
  signature_image_path TEXT,
  document_hash_at_signature TEXT,
  decline_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE app.document_access_log (
  id UUID PRIMARY KEY DEFAULT uuidv7(),
  organization_id UUID NOT NULL REFERENCES app.organizations(id) ON DELETE CASCADE,
  document_id UUID NOT NULL REFERENCES app.documents(id) ON DELETE CASCADE,
  actor_user_id UUID REFERENCES auth.users(id),
  actor_kind TEXT NOT NULL CHECK (actor_kind IN ('user', 'token', 'system')),
  action TEXT NOT NULL CHECK (action IN ('view', 'download', 'regenerate', 'delete')),
  ip INET,
  user_agent TEXT,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ix_documents_org_dossier ON app.documents(organization_id, dossier_id)
  WHERE deleted_at IS NULL;
CREATE INDEX ix_documents_org_status ON app.documents(organization_id, status)
  WHERE deleted_at IS NULL;
CREATE INDEX ix_documents_kind ON app.documents(organization_id, kind)
  WHERE deleted_at IS NULL;
CREATE INDEX ix_signatures_doc ON app.document_signatures(document_id);
CREATE INDEX ix_signatures_pending
  ON app.document_signatures(organization_id, status, request_expires_at)
  WHERE status = 'pending';
CREATE INDEX ix_doc_access_log_doc ON app.document_access_log(document_id, occurred_at DESC);
