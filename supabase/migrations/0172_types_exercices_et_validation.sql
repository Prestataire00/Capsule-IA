-- Plusieurs formes d'exercice, et validation du cours par la direction.
--
-- La 0171 n'offrait que deux formes : le devoir à rendu libre et le QCM. Un
-- formateur travaille aussi au texte à trou, aux cartes mémoire et à la vidéo
-- commentée — ce sont des outils différents, pas des variantes de mise en page.
--
-- Et comme pour les supports (0165), rien de ce qu'un intervenant extérieur
-- prépare n'atteint les stagiaires sans l'accord d'un propriétaire ou d'un
-- administrateur : l'organisme répond de ce qu'il diffuse.

-- ── 1. Les formes d'exercice ────────────────────────────────────────────────

ALTER TABLE app.exercises DROP CONSTRAINT IF EXISTS exercises_kind_check;
ALTER TABLE app.exercises ADD CONSTRAINT exercises_kind_check
  CHECK (kind IN ('devoir', 'quiz', 'texte_a_trou', 'cartes_memoire', 'video'));

-- Contenu propre à la forme : texte troué, cartes recto/verso, lien vidéo.
-- Le QCM garde ses questions dans `questions` (0171), inchangé.
ALTER TABLE app.exercises
  ADD COLUMN IF NOT EXISTS content JSONB NOT NULL DEFAULT '{}'::jsonb;

-- Une forme sans son contenu ne peut pas être travaillée : autant l'interdire
-- ici plutôt que de découvrir l'exercice vide dans l'espace du stagiaire.
ALTER TABLE app.exercises DROP CONSTRAINT IF EXISTS exercises_contenu_par_forme;
ALTER TABLE app.exercises ADD CONSTRAINT exercises_contenu_par_forme CHECK (
  CASE kind
    WHEN 'texte_a_trou'   THEN length(btrim(COALESCE(content ->> 'texte', ''))) > 0
    WHEN 'cartes_memoire' THEN jsonb_array_length(COALESCE(content -> 'cartes', '[]'::jsonb)) > 0
    WHEN 'video'          THEN length(btrim(COALESCE(content ->> 'url', ''))) > 0
    ELSE true
  END
);

-- ── 2. Validation par la direction ──────────────────────────────────────────

ALTER TABLE app.exercises
  ADD COLUMN IF NOT EXISTS validation_status TEXT NOT NULL DEFAULT 'en_attente'
    CHECK (validation_status IN ('en_attente', 'valide', 'refuse')),
  ADD COLUMN IF NOT EXISTS validated_by     UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS validated_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT
    CHECK (rejection_reason IS NULL OR length(rejection_reason) <= 1000),
  ADD COLUMN IF NOT EXISTS submitted_at     TIMESTAMPTZ NOT NULL DEFAULT now();

-- La file d'attente de l'administration, le plus ancien dépôt d'abord.
CREATE INDEX IF NOT EXISTS ix_exercises_a_valider
  ON app.exercises (organization_id, submitted_at)
  WHERE deleted_at IS NULL AND validation_status = 'en_attente';

-- Ce qui existait avant cette règle a été posé par l'organisme lui-même :
-- le passer en attente le retirerait aux stagiaires sans raison.
UPDATE app.exercises
   SET validation_status = 'valide', validated_at = COALESCE(validated_at, created_at)
 WHERE validation_status = 'en_attente'
   AND created_at < now();

-- ── 3. Trace de l'aide de l'IA ──────────────────────────────────────────────
-- Un contenu proposé par le modèle puis relu reste identifiable : c'est utile
-- en audit, et cela ne dit rien de plus que « l'IA a servi de brouillon ».

ALTER TABLE app.exercises
  ADD COLUMN IF NOT EXISTS ai_assisted BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN app.exercises.kind IS
  'devoir | quiz | texte_a_trou | cartes_memoire | video.';
COMMENT ON COLUMN app.exercises.content IS
  'Contenu propre à la forme : {texte} pour un texte à trou, {cartes:[{recto,verso}]} pour des cartes, {url,description} pour une vidéo.';
COMMENT ON COLUMN app.exercises.validation_status IS
  'en_attente | valide | refuse — seul « valide » est diffusé aux stagiaires.';
COMMENT ON COLUMN app.exercises.ai_assisted IS
  'Le brouillon a été proposé par l''IA, puis relu par le formateur.';
