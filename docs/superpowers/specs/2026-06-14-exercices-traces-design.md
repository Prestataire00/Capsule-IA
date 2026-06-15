# Espace apprenant — Exercices tracés (#3/3)

**Date :** 2026-06-14 · **Statut :** design validé · **Base :** stacké sur #2 `feat/espace-replays` (migrations 0063-0067). Logiquement indépendant de #1/#2 ; stacké pour numérotation linéaire.

## Contexte / décisions

Sous-projet #3. Aujourd'hui les exercices de l'espace apprenant sont `MOCK_EXERCISES` (4 entrées en dur, aucune table, aucune soumission). Le modèle questionnaire existe mais vise les formulaires auto-scorés (positionnement/satisfaction).

**Décisions :**
1. **Modèle dédié, PAS réutilisation des questionnaires** : un exercice = livrable ouvert (texte + fichier) corrigé manuellement par l'OF → workflow assign→submit→grade distinct d'un questionnaire.
2. **Exercices dossier-scoped** (assignés à une cohorte), avec `module_id` nullable pour regroupement.
3. **Soumission apprenant via route serveur** (l'apprenant n'a pas de session Supabase, seulement un JWT token) : pas d'upload Storage client → un endpoint serveur (service_role) reçoit fichier+texte après vérif du token. ⇒ le bucket `learner-submissions` n'a besoin d'AUCUNE policy d'écriture client (service_role uniquement). Lecture gestionnaire via route signed-URL serveur.

## Modèle de données — `supabase/migrations/0068_exercises.sql`

```sql
CREATE TABLE app.exercises (
  id               UUID PRIMARY KEY DEFAULT uuidv7(),
  organization_id  UUID NOT NULL REFERENCES app.organizations(id) ON DELETE CASCADE,
  dossier_id       UUID NOT NULL REFERENCES app.dossiers(id) ON DELETE CASCADE,
  module_id        UUID REFERENCES app.modules(id) ON DELETE SET NULL,   -- regroupement optionnel
  title            TEXT NOT NULL CHECK (length(btrim(title)) > 0),
  instructions     TEXT,
  attachment_path  TEXT,                       -- énoncé fourni par l'OF (bucket pedagogical de #1)
  due_at           TIMESTAMPTZ,
  is_published     BOOLEAN NOT NULL DEFAULT true,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by       UUID REFERENCES auth.users(id),
  deleted_at       TIMESTAMPTZ NULL
);
CREATE INDEX ix_exercises_org_dossier ON app.exercises(organization_id, dossier_id) WHERE deleted_at IS NULL;

CREATE TABLE app.exercise_submissions (
  id               UUID PRIMARY KEY DEFAULT uuidv7(),
  organization_id  UUID NOT NULL REFERENCES app.organizations(id) ON DELETE CASCADE,
  exercise_id      UUID NOT NULL REFERENCES app.exercises(id) ON DELETE CASCADE,
  learner_id       UUID NOT NULL REFERENCES app.learners(id) ON DELETE CASCADE,
  content          TEXT,                       -- réponse texte
  file_path        TEXT,                       -- fichier rendu (bucket learner-submissions)
  status           TEXT NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted','graded')),
  grade            NUMERIC(5,2) CHECK (grade IS NULL OR grade >= 0),
  feedback         TEXT,
  submitted_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  graded_at        TIMESTAMPTZ,
  graded_by        UUID REFERENCES auth.users(id),
  CHECK (content IS NOT NULL OR file_path IS NOT NULL),   -- au moins une preuve de rendu
  UNIQUE (exercise_id, learner_id)            -- une soumission/apprenant/exercice (resubmit = update)
);
CREATE INDEX ix_exercise_submissions_org_exercise ON app.exercise_submissions(organization_id, exercise_id);

-- RLS enable+force sur les 2 tables.
-- exercises : SELECT = app.current_organization_id() AND deleted_at IS NULL ; INSERT/UPDATE/DELETE = + app.is_staff()  (calque module_resources 0063)
-- exercise_submissions : SELECT = app.current_organization_id() ; UPDATE (correction) = + app.is_staff() ; PAS d'INSERT/DELETE policy (écriture apprenant = service_role via route serveur)
```

Bucket : `INSERT INTO storage.buckets ('learner-submissions', private, ~20MB, ARRAY[pdf,docx,xlsx,pptx,png,jpeg,zip])`. **Aucune policy d'écriture** (service_role only). Lecture : aucune policy authenticated nécessaire (gestionnaire télécharge via route signed-URL service_role).

pgTAP `0068_test_exercises_rls.sql` : isolation tenant exercises + exercise_submissions ; INSERT submission refusé en authenticated (réservé service_role) ; anon no-access. Mêmes helpers que #1/#2.

## Backend

- Resolver apprenant `apps/web/app/(apprenant)/espace/[token]/exercises.ts` (server-only) : `resolveApprenantExercises(token)` → liste les `exercises` publiés du dossier (+ jointure sur sa propre `exercise_submissions` → statut/grade/feedback). Via `supabaseServer().rpc` SECURITY DEFINER `app.get_apprenant_exercises(p_learner_id)` OU requête directe service_role (cohérent avec #1). **Choix : RPC SECURITY DEFINER** (cohérent avec `get_apprenant_resources`).
- Route soumission `apps/web/app/api/espace/[token]/exercise/[exerciseId]/submit/route.ts` (POST multipart) : vérifie token + exercice appartient au dossier ; upload fichier (si présent) dans `learner-submissions` via service_role (`{org}/{exercise}/{uuid}-{name}`) ; upsert `exercise_submissions` (content/file_path, status='submitted', submitted_at=now()) par `(exercise_id, learner_id)`. Best-effort log `resource_access_log` non requis (c'est une écriture, pas une consultation) — optionnel.
- Gestionnaire : `apps/web/app/(dashboard)/dossiers/[id]/exercices/actions.ts` (`authActionClient`) : `createExercise` (title, instructions, due_at, module_id?, attachment via upload pedagogical côté client comme #1), `gradeSubmission` (submissionId, grade, feedback → status='graded', graded_at, graded_by), `toggleExercisePublish`, `deleteExercise` (soft).
- Route téléchargement soumission (gestionnaire) `apps/web/app/api/dossiers/[id]/submission/[submissionId]/route.ts` : service_role, vérifie org via RLS-checked read, signed-URL `learner-submissions`, redirige.

## UI

- Espace `apps/web/app/(apprenant)/espace/[token]/exercices/page.tsx` : remplace `MOCK_EXERCISES` par `resolveApprenantExercises` ; chaque exercice montre statut (à rendre / rendu / corrigé + note + feedback) ; formulaire de soumission (texte + input fichier) postant vers la route submit. Supprimer `MOCK_EXERCISES` de `_lib.ts`.
- Gestionnaire `apps/web/app/(dashboard)/dossiers/[id]/exercices/page.tsx` : liste des exercices du dossier + création + pour chaque exercice la liste des soumissions (apprenant, fichier, statut) avec formulaire de correction (note + feedback) et lien de téléchargement.

## Ordre / vérif
1. Migration 0068 + bucket + RLS + pgTAP. 2. RPC `get_apprenant_exercises`. 3. route submit + resolver. 4. actions gestionnaire + routes download. 5. UI espace + UI gestionnaire + suppression mock.
- **Vérif** : `pnpm --filter web build` + pgTAP/migration sur staging (API Management, [[project_ia_infinity_staging]]). Casts `as never` (types non régénérés).

## Hors-scope
Notation par grille/barème structuré ; corrections multi-correcteurs ; notifications email de rendu/correction (peut réutiliser l'outbox `infra.domain_events` plus tard) ; anti-plagiat.
