-- 0149 — Émargement : justificatifs d'absence (modèle Edusign)
--
-- L'apprenant absent dépose un justificatif (arrêt de travail, convocation…)
-- depuis son lien d'émargement ou son espace ; l'équipe l'examine, l'accepte
-- (l'absence devient « excusée ») ou le refuse. L'équipe peut aussi en déposer
-- un elle-même, accepté d'office.
--
-- Ces pièces peuvent contenir des données de santé : lecture réservée aux
-- rôles qui gèrent l'émargement ; aucune écriture directe par les membres
-- (dépôt et décision passent par des routes et actions gardées, en service
-- role). Seau privé, fichiers servis par URL signée d'une minute.
--
-- Rejouable sans risque.

CREATE TABLE IF NOT EXISTS app.attendance_justifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES app.organizations(id) ON DELETE CASCADE,
  attendance_sheet_id UUID NOT NULL REFERENCES app.attendance_sheets(id) ON DELETE CASCADE,
  learner_id UUID NOT NULL REFERENCES app.learners(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL UNIQUE,
  file_name TEXT NOT NULL CHECK (char_length(file_name) BETWEEN 1 AND 160),
  mime_type TEXT NOT NULL CHECK (mime_type IN ('application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'image/heic')),
  size_bytes INTEGER NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 10485760),
  comment TEXT CHECK (comment IS NULL OR char_length(comment) <= 500),
  submitted_via TEXT NOT NULL CHECK (submitted_via IN ('apprenant', 'equipe')),
  submitted_by UUID,
  decision TEXT NOT NULL DEFAULT 'en_attente' CHECK (decision IN ('en_attente', 'acceptee', 'refusee')),
  decided_by UUID,
  decided_at TIMESTAMPTZ,
  decision_note TEXT CHECK (decision_note IS NULL OR char_length(decision_note) <= 500),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT attendance_justifications_decided_check CHECK ((decision = 'en_attente') = (decided_at IS NULL)),
  CONSTRAINT attendance_justifications_submitter_check CHECK (submitted_via = 'apprenant' OR submitted_by IS NOT NULL)
);

COMMENT ON TABLE app.attendance_justifications IS
  'Justificatifs d''absence déposés par l''apprenant ou l''équipe, et décision de l''équipe (0149).';

CREATE INDEX IF NOT EXISTS attendance_justifications_sheet_learner_idx
  ON app.attendance_justifications (attendance_sheet_id, learner_id);
CREATE INDEX IF NOT EXISTS attendance_justifications_pending_idx
  ON app.attendance_justifications (organization_id, created_at)
  WHERE decision = 'en_attente';

ALTER TABLE app.attendance_justifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.attendance_justifications FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS attendance_justifications_select ON app.attendance_justifications;
CREATE POLICY attendance_justifications_select ON app.attendance_justifications
  FOR SELECT TO authenticated
  USING (
    organization_id = app.current_organization_id()
    AND app.current_role() IN ('owner', 'admin', 'gestionnaire', 'formateur')
  );

REVOKE ALL ON app.attendance_justifications FROM PUBLIC, anon, authenticated;
GRANT SELECT ON app.attendance_justifications TO authenticated;
GRANT ALL ON app.attendance_justifications TO service_role;

-- ── Seau privé : aucun accès direct, fichiers servis par URL signée ───────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'attendance-justifications',
  'attendance-justifications',
  false,
  10485760, -- 10 Mo
  ARRAY['application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'image/heic']
)
ON CONFLICT (id) DO UPDATE
  SET public = false,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

NOTIFY pgrst, 'reload schema';
