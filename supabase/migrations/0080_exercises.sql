-- ============================================================================
-- 0080 — Tables app.exercises + app.exercise_submissions + bucket learner-submissions
-- ============================================================================
-- Contexte : dossier. Exercices assignés à un apprenant dans le cadre d'un
-- dossier (liés optionnellement à un module). Soumissions des apprenants avec
-- correction possible par le staff. Bucket privé pour les fichiers soumis.

-- ============================================================================
-- Table app.exercises
-- ============================================================================
-- Exercice assigné à un apprenant (via dossier). Soft-delete via deleted_at.
-- Calqué sur app.module_resources (0063) : même pattern RLS staff/org.

CREATE TABLE app.exercises (
  id               UUID        PRIMARY KEY DEFAULT uuidv7(),
  organization_id  UUID        NOT NULL REFERENCES app.organizations(id) ON DELETE CASCADE,
  dossier_id       UUID        NOT NULL REFERENCES app.dossiers(id) ON DELETE CASCADE,
  module_id        UUID        REFERENCES app.modules(id) ON DELETE SET NULL,
  title            TEXT        NOT NULL CHECK (length(btrim(title)) > 0),
  instructions     TEXT,
  attachment_path  TEXT,
  due_at           TIMESTAMPTZ,
  is_published     BOOLEAN     NOT NULL DEFAULT true,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by       UUID        REFERENCES auth.users(id),
  deleted_at       TIMESTAMPTZ NULL
);

-- Index partiel : actif uniquement sur les exercices non supprimés
CREATE INDEX ix_exercises_org_dossier
  ON app.exercises (organization_id, dossier_id)
  WHERE deleted_at IS NULL;

-- ── RLS ───────────────────────────────────────────────────────────────────────

ALTER TABLE app.exercises ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.exercises FORCE ROW LEVEL SECURITY;

-- Lecture : tout membre de l'organisation (même pattern que app.module_resources)
CREATE POLICY exercises_select ON app.exercises FOR SELECT
  USING (organization_id = app.current_organization_id() AND deleted_at IS NULL);

-- Création : staff uniquement (même pattern que module_resources_insert)
CREATE POLICY exercises_insert ON app.exercises FOR INSERT
  WITH CHECK (organization_id = app.current_organization_id() AND app.is_staff());

-- Modification : staff uniquement
CREATE POLICY exercises_update ON app.exercises FOR UPDATE
  USING  (organization_id = app.current_organization_id() AND app.is_staff())
  WITH CHECK (organization_id = app.current_organization_id() AND app.is_staff());

-- Suppression logique (deleted_at) ou physique : staff uniquement
CREATE POLICY exercises_delete ON app.exercises FOR DELETE
  USING (organization_id = app.current_organization_id() AND app.is_staff());

-- ============================================================================
-- Table app.exercise_submissions
-- ============================================================================
-- Soumission d'un apprenant à un exercice. Correction optionnelle par le staff.
--
-- Choix d'architecture :
--   • Pas de policy INSERT ni DELETE : l'écriture d'une soumission est réservée
--     au service_role (route serveur Next.js avec supabaseAdmin). Exposer une
--     policy INSERT authentifiée permettrait à un apprenant de soumettre
--     directement depuis le client et de contourner les validations serveur
--     (quota de tentatives, vérification du statut du dossier, audit trail).
--     Même logique que app.resource_access_log (0064).

CREATE TABLE app.exercise_submissions (
  id               UUID          PRIMARY KEY DEFAULT uuidv7(),
  organization_id  UUID          NOT NULL REFERENCES app.organizations(id) ON DELETE CASCADE,
  exercise_id      UUID          NOT NULL REFERENCES app.exercises(id) ON DELETE CASCADE,
  learner_id       UUID          NOT NULL REFERENCES app.learners(id) ON DELETE CASCADE,
  content          TEXT,
  file_path        TEXT,
  status           TEXT          NOT NULL DEFAULT 'submitted'
                                 CHECK (status IN ('submitted', 'graded')),
  grade            NUMERIC(5,2)  CHECK (grade IS NULL OR grade >= 0),
  feedback         TEXT,
  submitted_at     TIMESTAMPTZ   NOT NULL DEFAULT now(),
  graded_at        TIMESTAMPTZ,
  graded_by        UUID          REFERENCES auth.users(id),
  CHECK (content IS NOT NULL OR file_path IS NOT NULL),
  UNIQUE (exercise_id, learner_id)
);

-- Index principal : requêtes par org + exercice (vue correction staff)
CREATE INDEX ix_exercise_submissions_org_exercise
  ON app.exercise_submissions (organization_id, exercise_id);

-- ── RLS ───────────────────────────────────────────────────────────────────────

ALTER TABLE app.exercise_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.exercise_submissions FORCE ROW LEVEL SECURITY;

-- Lecture : tout membre de l'organisation
CREATE POLICY exercise_submissions_select ON app.exercise_submissions FOR SELECT
  USING (organization_id = app.current_organization_id());

-- Correction (mise à jour du grade/feedback) : staff uniquement
CREATE POLICY exercise_submissions_update ON app.exercise_submissions FOR UPDATE
  USING  (organization_id = app.current_organization_id() AND app.is_staff())
  WITH CHECK (organization_id = app.current_organization_id() AND app.is_staff());

-- INSERT / DELETE : aucune policy intentionnellement.
-- L'écriture est réservée au service_role (routes serveur Next.js / supabaseAdmin).
-- Voir commentaire d'en-tête pour le raisonnement sécurité.

-- ============================================================================
-- Bucket Storage privé pour les fichiers soumis par les apprenants
-- ============================================================================
-- Bucket privé "learner-submissions" : PDF, Word, Excel, PowerPoint, images, ZIP.
-- Limite 20 MB par fichier.
--
-- Choix d'architecture :
--   • AUCUNE policy sur storage.objects pour ce bucket.
--     Lecture et écriture réservées au service_role (routes serveur Next.js /
--     supabaseAdmin avec signed URLs générées côté serveur). Cela permet de
--     contrôler les accès (vérifier que l'apprenant est bien l'auteur de la
--     soumission, que le dossier est actif) sans exposer de surface d'attaque
--     client sur le bucket. Même logique que le pattern resource_access_log.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'learner-submissions',
  'learner-submissions',
  false,
  20971520, -- 20 MB
  ARRAY[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'image/png',
    'image/jpeg',
    'application/zip'
  ]
)
ON CONFLICT (id) DO NOTHING;

-- Aucune policy storage.objects définie pour 'learner-submissions'.
-- Lecture + écriture = service_role uniquement, via routes serveur (signed URLs).
