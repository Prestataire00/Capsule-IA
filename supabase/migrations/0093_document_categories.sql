-- ============================================================================
-- 0093 — Catégories de modèles de documents (rangement en dossiers)
-- ----------------------------------------------------------------------------
-- Table org-scopée + RLS (lecture membres org, écriture admin/owner). Les
-- modèles référencent une catégorie (NULL = non classé). GRANT explicites
-- répliquant le modèle des autres tables app (cf. document_templates en prod :
-- authenticated/service_role = CRUD, anon = SELECT).
-- ============================================================================

CREATE TABLE IF NOT EXISTS app.document_categories (
  id UUID PRIMARY KEY DEFAULT uuidv7(),
  organization_id UUID NOT NULL REFERENCES app.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  position INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_document_categories_org
  ON app.document_categories (organization_id, position);

ALTER TABLE app.document_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.document_categories FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS document_categories_select ON app.document_categories;
CREATE POLICY document_categories_select ON app.document_categories FOR SELECT
USING (organization_id = app.current_organization_id());

DROP POLICY IF EXISTS document_categories_insert ON app.document_categories;
CREATE POLICY document_categories_insert ON app.document_categories FOR INSERT
WITH CHECK (organization_id = app.current_organization_id() AND app.is_admin_or_owner());

DROP POLICY IF EXISTS document_categories_update ON app.document_categories;
CREATE POLICY document_categories_update ON app.document_categories FOR UPDATE
USING (organization_id = app.current_organization_id() AND app.is_admin_or_owner())
WITH CHECK (organization_id = app.current_organization_id() AND app.is_admin_or_owner());

DROP POLICY IF EXISTS document_categories_delete ON app.document_categories;
CREATE POLICY document_categories_delete ON app.document_categories FOR DELETE
USING (organization_id = app.current_organization_id() AND app.is_admin_or_owner());

GRANT SELECT ON app.document_categories TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON app.document_categories TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON app.document_categories TO service_role;

ALTER TABLE app.document_templates
  ADD COLUMN IF NOT EXISTS category_id UUID REFERENCES app.document_categories(id) ON DELETE SET NULL;
