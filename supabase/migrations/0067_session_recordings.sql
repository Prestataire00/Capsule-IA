-- ============================================================================
-- 0067 — Enregistrements (replays) de séances, rattachés à la session
-- ============================================================================
-- Contexte : scheduling. Liens vers les replays vidéo (Zoom, upload manuel)
-- d'une séance de formation. Soft-delete via deleted_at. Multi-tenant RLS.

CREATE TABLE app.session_recordings (
  id               UUID        PRIMARY KEY DEFAULT uuidv7(),
  organization_id  UUID        NOT NULL REFERENCES app.organizations(id) ON DELETE CASCADE,
  session_id       UUID        NOT NULL REFERENCES app.sessions(id) ON DELETE CASCADE,
  source           TEXT        NOT NULL DEFAULT 'zoom' CHECK (source IN ('zoom', 'manual')),
  external_id      TEXT,
  play_url         TEXT        NOT NULL CHECK (length(btrim(play_url)) > 0),
  passcode         TEXT,
  duration_seconds INT         CHECK (duration_seconds IS NULL OR duration_seconds >= 0),
  recorded_at      TIMESTAMPTZ,
  is_published     BOOLEAN     NOT NULL DEFAULT true,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by       UUID        REFERENCES auth.users(id),
  deleted_at       TIMESTAMPTZ NULL,
  UNIQUE (session_id, external_id)
);

-- Index partiel : actif uniquement sur les enregistrements non supprimés
CREATE INDEX ix_session_recordings_org_session
  ON app.session_recordings (organization_id, session_id)
  WHERE deleted_at IS NULL;

-- ── RLS ───────────────────────────────────────────────────────────────────────

ALTER TABLE app.session_recordings ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.session_recordings FORCE ROW LEVEL SECURITY;

-- Lecture : tout membre de l'organisation (même pattern que app.module_resources)
CREATE POLICY session_recordings_select ON app.session_recordings FOR SELECT
  USING (organization_id = app.current_organization_id() AND deleted_at IS NULL);

-- Création : staff uniquement
CREATE POLICY session_recordings_insert ON app.session_recordings FOR INSERT
  WITH CHECK (organization_id = app.current_organization_id() AND app.is_staff());

-- Modification : staff uniquement
CREATE POLICY session_recordings_update ON app.session_recordings FOR UPDATE
  USING  (organization_id = app.current_organization_id() AND app.is_staff())
  WITH CHECK (organization_id = app.current_organization_id() AND app.is_staff());

-- Suppression logique (deleted_at) ou physique : staff uniquement
CREATE POLICY session_recordings_delete ON app.session_recordings FOR DELETE
  USING (organization_id = app.current_organization_id() AND app.is_staff());
