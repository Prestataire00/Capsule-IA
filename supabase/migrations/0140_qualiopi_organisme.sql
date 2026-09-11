-- 0140 — Qualiopi au niveau de l'organisme : statut par indicateur et preuves.
--
-- Constat (audit 2026-09-11, CAP-36) : sur les 32 indicateurs, 17 relèvent de
-- l'organisme et non d'un dossier (information du public, moyens, veille,
-- réclamations, amélioration continue…). Aucun n'était évalué ni suivi, et
-- aucune preuve ne pouvait être déposée : la table `qualiopi_proofs` existait,
-- mais rien dans l'application ne l'alimentait.
--
-- Sur le modèle de l'auto-évaluation de Digiforma — une validation par
-- indicateur —, enrichi de ce qui lui manque : les preuves elles-mêmes.
--
-- 1. `qualiopi_org_indicator_status` : où en est l'organisme sur chaque
--    indicateur (à traiter, en cours, conforme, non applicable), avec une note.
--    Pas de suppression : on change de statut, on ne l'efface pas.
-- 2. Seau de stockage privé `qualiopi-proofs` pour les pièces déposées :
--    PDF, images, documents bureautiques. Chemin : {organisation}/I{numéro}/…,
--    lecture et écriture bornées à l'organisation courante (idiome de 0133).

-- ── 1. Statut par indicateur ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS app.qualiopi_org_indicator_status (
  id              UUID PRIMARY KEY DEFAULT uuidv7(),
  organization_id UUID NOT NULL REFERENCES app.organizations(id) ON DELETE CASCADE,
  indicator_id    UUID NOT NULL REFERENCES app.qualiopi_indicators(id) ON DELETE CASCADE,
  status          TEXT NOT NULL DEFAULT 'a_traiter'
                  CHECK (status IN ('a_traiter', 'en_cours', 'conforme', 'non_applicable')),
  note            TEXT CHECK (note IS NULL OR length(note) <= 2000),
  updated_by      UUID REFERENCES app.members(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, indicator_id)
);

CREATE INDEX IF NOT EXISTS ix_qualiopi_org_status_org
  ON app.qualiopi_org_indicator_status (organization_id);

ALTER TABLE app.qualiopi_org_indicator_status ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.qualiopi_org_indicator_status FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS qualiopi_org_status_select ON app.qualiopi_org_indicator_status;
CREATE POLICY qualiopi_org_status_select ON app.qualiopi_org_indicator_status
  FOR SELECT TO authenticated
  USING (organization_id = app.current_organization_id());

DROP POLICY IF EXISTS qualiopi_org_status_insert ON app.qualiopi_org_indicator_status;
CREATE POLICY qualiopi_org_status_insert ON app.qualiopi_org_indicator_status
  FOR INSERT TO authenticated
  WITH CHECK (organization_id = app.current_organization_id() AND app.is_staff());

DROP POLICY IF EXISTS qualiopi_org_status_update ON app.qualiopi_org_indicator_status;
CREATE POLICY qualiopi_org_status_update ON app.qualiopi_org_indicator_status
  FOR UPDATE TO authenticated
  USING (organization_id = app.current_organization_id() AND app.is_staff())
  WITH CHECK (organization_id = app.current_organization_id() AND app.is_staff());

COMMENT ON TABLE app.qualiopi_org_indicator_status IS
  'Auto-évaluation de l''organisme par indicateur Qualiopi : statut et note (audit CAP-36).';

-- ── 2. Seau des preuves ─────────────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'qualiopi-proofs',
  'qualiopi-proofs',
  false,
  20971520, -- 20 Mo
  ARRAY[
    'application/pdf',
    'image/png', 'image/jpeg', 'image/webp',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain'
  ]
)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "qualiopi_proofs_read" ON storage.objects;
CREATE POLICY "qualiopi_proofs_read"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'qualiopi-proofs'
    AND (storage.foldername(name))[1] = app.current_organization_id()::text
  );

DROP POLICY IF EXISTS "qualiopi_proofs_insert" ON storage.objects;
CREATE POLICY "qualiopi_proofs_insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'qualiopi-proofs'
    AND (storage.foldername(name))[1] = app.current_organization_id()::text
    AND app.is_staff()
  );

DROP POLICY IF EXISTS "qualiopi_proofs_delete" ON storage.objects;
CREATE POLICY "qualiopi_proofs_delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'qualiopi-proofs'
    AND (storage.foldername(name))[1] = app.current_organization_id()::text
    AND app.is_staff()
  );

NOTIFY pgrst, 'reload schema';
