-- ============================================================================
-- 0075 — Table app.module_resources (supports pédagogiques par module)
-- ============================================================================
-- Contexte : catalog. Fichiers réutilisables attachés à un module (PDF, PPTX,
-- XLSX, DOCX, images). Soft-delete via deleted_at.

CREATE TABLE app.module_resources (
  id               UUID        PRIMARY KEY DEFAULT uuidv7(),
  organization_id  UUID        NOT NULL REFERENCES app.organizations(id) ON DELETE CASCADE,
  module_id        UUID        NOT NULL REFERENCES app.modules(id) ON DELETE CASCADE,
  title            TEXT        NOT NULL CHECK (length(btrim(title)) > 0),
  description      TEXT,
  storage_path     TEXT        NOT NULL,
  mime_type        TEXT        NOT NULL,
  file_size_bytes  BIGINT      CHECK (file_size_bytes IS NULL OR file_size_bytes >= 0),
  file_hash        TEXT,
  position         INT         NOT NULL DEFAULT 0 CHECK (position >= 0),
  is_published     BOOLEAN     NOT NULL DEFAULT true,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by       UUID        REFERENCES auth.users(id),
  deleted_at       TIMESTAMPTZ NULL
);

-- Index partiel : actif uniquement sur les ressources non supprimées
CREATE INDEX ix_module_resources_org_module
  ON app.module_resources (organization_id, module_id)
  WHERE deleted_at IS NULL;

-- ── RLS ───────────────────────────────────────────────────────────────────────

ALTER TABLE app.module_resources ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.module_resources FORCE ROW LEVEL SECURITY;

-- Lecture : tout membre de l'organisation (même pattern que app.modules)
CREATE POLICY module_resources_select ON app.module_resources FOR SELECT
  USING (organization_id = app.current_organization_id() AND deleted_at IS NULL);

-- Création : staff uniquement (même pattern que modules_insert)
CREATE POLICY module_resources_insert ON app.module_resources FOR INSERT
  WITH CHECK (organization_id = app.current_organization_id() AND app.is_staff());

-- Modification : staff uniquement
CREATE POLICY module_resources_update ON app.module_resources FOR UPDATE
  USING  (organization_id = app.current_organization_id() AND app.is_staff())
  WITH CHECK (organization_id = app.current_organization_id() AND app.is_staff());

-- Suppression logique (deleted_at) ou physique : staff uniquement
CREATE POLICY module_resources_delete ON app.module_resources FOR DELETE
  USING (organization_id = app.current_organization_id() AND app.is_staff());
