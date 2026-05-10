-- ============================================================================
-- 0025 — Prospects (pré-inscriptions publiques) + Storage bucket
-- ============================================================================
-- Une pré-inscription est créée par un utilisateur ANONYME via /inscription.
-- organization_id est nullable : la pré-inscription est "non assignée" tant
-- qu'un membre de l'OF ne l'a pas revendiquée (triage). L'écriture publique
-- passe par une Server Action en service_role : pas de policy anon ici.
-- ============================================================================

CREATE TYPE app.prospect_status AS ENUM (
  'new', 'contacted', 'qualified', 'converted', 'archived'
);

CREATE TYPE app.prospect_situation AS ENUM (
  'salarie', 'demandeur', 'independant', 'particulier'
);

CREATE TABLE app.prospects (
  id UUID PRIMARY KEY DEFAULT uuidv7(),
  organization_id UUID REFERENCES app.organizations(id) ON DELETE CASCADE,

  -- Identité apprenant
  civility TEXT CHECK (civility IN ('m', 'mme')),
  first_name TEXT NOT NULL CHECK (length(first_name) BETWEEN 1 AND 100),
  last_name TEXT NOT NULL CHECK (length(last_name) BETWEEN 1 AND 100),
  email TEXT NOT NULL CHECK (email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  phone TEXT CHECK (length(phone) <= 30),
  birth_date DATE,
  rqth BOOLEAN NOT NULL DEFAULT false,

  -- Formation visée
  formation_id UUID REFERENCES app.formations(id) ON DELETE SET NULL,
  preferred_modality app.training_modality,
  preferred_start_date DATE,
  message TEXT CHECK (length(message) <= 2000),

  -- Financement
  situation app.prospect_situation NOT NULL,
  company_name TEXT CHECK (length(company_name) <= 200),
  funder_kind app.funder_kind NOT NULL,

  -- Documents : metadata only ; fichiers stockés dans bucket prospect-documents.
  -- Format : [{ key, label, storage_path, size, content_type, uploaded_at }]
  documents JSONB NOT NULL DEFAULT '[]'::jsonb,

  -- Workflow interne
  status app.prospect_status NOT NULL DEFAULT 'new',
  assigned_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  internal_notes TEXT,
  converted_dossier_id UUID REFERENCES app.dossiers(id) ON DELETE SET NULL,

  -- Audit / provenance
  source TEXT,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX ix_prospects_org_status
  ON app.prospects(organization_id, status, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX ix_prospects_email
  ON app.prospects(email)
  WHERE deleted_at IS NULL;

CREATE INDEX ix_prospects_unassigned
  ON app.prospects(created_at DESC)
  WHERE organization_id IS NULL AND deleted_at IS NULL;

ALTER TABLE app.prospects ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.prospects FORCE ROW LEVEL SECURITY;

-- Membres : voient les prospects de leur org + les non-assignés (triage)
CREATE POLICY prospects_select ON app.prospects FOR SELECT TO authenticated
USING (
  (organization_id = app.current_organization_id() OR organization_id IS NULL)
  AND deleted_at IS NULL
);

-- Membres : mettent à jour leur org + peuvent s'attribuer un non-assigné
CREATE POLICY prospects_update ON app.prospects FOR UPDATE TO authenticated
USING (
  (organization_id = app.current_organization_id() OR organization_id IS NULL)
  AND deleted_at IS NULL
)
WITH CHECK (
  organization_id = app.current_organization_id() OR organization_id IS NULL
);

-- Suppression dure réservée admin/owner
CREATE POLICY prospects_delete ON app.prospects FOR DELETE TO authenticated
USING (organization_id = app.current_organization_id() AND app.is_admin_or_owner());

-- ── Storage bucket ─────────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public)
VALUES ('prospect-documents', 'prospect-documents', false)
ON CONFLICT (id) DO NOTHING;

-- Lecture pour les membres authentifiés ; écriture réservée au service_role
-- (la Server Action passe par admin client — pas de policy anon ici).
CREATE POLICY "prospect_docs_member_read"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'prospect-documents');
