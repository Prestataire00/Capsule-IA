-- ============================================================================
-- 0063 — Documents juridiques niveau organisme (générés par IA, validés)
-- ============================================================================

ALTER TABLE app.document_templates DROP CONSTRAINT IF EXISTS document_templates_kind_check;
ALTER TABLE app.document_templates ADD CONSTRAINT document_templates_kind_check
  CHECK (kind IN (
    'convention', 'convocation', 'programme', 'attestation_presence',
    'attestation_fin', 'certificat_realisation', 'reglement_interieur',
    'livret_accueil', 'devis', 'facture', 'feuille_emargement',
    'questionnaire', 'convention_collective', 'cgv', 'autre'
  ));

CREATE TABLE app.org_legal_documents (
  id UUID PRIMARY KEY DEFAULT uuidv7(),
  organization_id UUID NOT NULL REFERENCES app.organizations(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('reglement_interieur','cgv','livret_accueil')),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','validated')),
  content_md TEXT,
  sources_used JSONB NOT NULL DEFAULT '[]'::jsonb,
  generated_model TEXT,
  generated_at TIMESTAMPTZ,
  validated_by UUID REFERENCES auth.users(id),
  validated_at TIMESTAMPTZ,
  pdf_storage_path TEXT,
  version INT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, kind)
);

ALTER TABLE app.org_legal_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY org_legal_documents_rw ON app.org_legal_documents
  FOR ALL TO authenticated
  USING (organization_id = app.current_organization_id())
  WITH CHECK (organization_id = app.current_organization_id());
