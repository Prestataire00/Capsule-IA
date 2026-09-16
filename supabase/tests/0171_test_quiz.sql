-- ============================================================================
-- Tests pgTAP : quiz et préparation du cours (0171).
-- Un quiz ne peut pas exister sans question, et un rendu de quiz — qui n'a ni
-- texte ni fichier — doit pouvoir être enregistré.
-- ============================================================================
BEGIN;
SELECT plan(9);

SELECT has_column('app', 'exercises', 'kind', 'devoir ou quiz');
SELECT has_column('app', 'exercises', 'questions', 'questions du quiz');
SELECT has_column('app', 'exercises', 'pass_score', 'seuil de réussite');
SELECT has_column('app', 'exercises', 'session_id', 'rattachement facultatif à une séance');
SELECT has_column('app', 'exercise_submissions', 'answers', 'réponses cochées');
SELECT has_column('app', 'exercise_submissions', 'max_grade', 'barème figé au rendu');

SELECT col_default_is('app', 'exercises', 'kind', 'devoir',
  'un exercice reste un devoir tant qu''on n''en fait pas un quiz');

-- La contrainte d'origine exigeait un texte ou un fichier : un rendu de quiz
-- n'a ni l'un ni l'autre, et n'aurait jamais pu être enregistré.
SELECT hasnt_column('app', 'exercise_submissions', 'answers_obsolete',
  'aucune colonne héritée d''une tentative précédente');

SELECT ok(
  (SELECT COUNT(*) FROM pg_constraint con
     JOIN pg_class cl ON cl.oid = con.conrelid
     JOIN pg_namespace ns ON ns.oid = cl.relnamespace
    WHERE ns.nspname = 'app'
      AND cl.relname = 'exercise_submissions'
      AND con.conname = 'exercise_submissions_a_un_contenu') = 1,
  'le rendu accepte désormais un texte, un fichier OU des réponses');

SELECT * FROM finish();
ROLLBACK;
