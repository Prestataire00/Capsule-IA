-- 0151 — Espace formateur : questionnaires envoyés par le formateur, évaluations reçues
--
--  · Une affectation porte la séance et le formateur qui l'a envoyée.
--  · Suivi d'une séance (`my_session_questionnaires`) : pour les tests
--    pédagogiques (positionnement, acquis, personnalisé), le formateur voit le
--    résultat de chaque apprenant ; pour les questionnaires de satisfaction,
--    ni nom, ni réponse, ni score — ils sont annoncés anonymes aux apprenants.
--  · « Mes évaluations » (`my_trainer_evaluations`) : moyennes de satisfaction
--    et note du formateur par formation, et commentaires sans nom, seulement à
--    partir de trois réponses (en deçà, une réponse se reconnaîtrait).
--
-- Rejouable sans risque.

ALTER TABLE app.questionnaire_assignments
  ADD COLUMN IF NOT EXISTS session_id UUID REFERENCES app.sessions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS sent_by_trainer_id UUID REFERENCES app.trainers(id) ON DELETE SET NULL;

COMMENT ON COLUMN app.questionnaire_assignments.session_id IS 'Séance pour laquelle le questionnaire a été envoyé (0151).';
COMMENT ON COLUMN app.questionnaire_assignments.sent_by_trainer_id IS 'Formateur qui l''a envoyé depuis son espace (0151).';

CREATE INDEX IF NOT EXISTS questionnaire_assignments_session_idx
  ON app.questionnaire_assignments (session_id) WHERE session_id IS NOT NULL;

CREATE OR REPLACE FUNCTION app.est_satisfaction(p_kind TEXT)
RETURNS BOOLEAN LANGUAGE sql IMMUTABLE AS $$
  SELECT p_kind IN ('satisfaction_chaud', 'satisfaction_froid', 'satisfaction_formateur')
$$;

-- ── Suivi des questionnaires d'une séance du formateur ─────────────────────
CREATE OR REPLACE FUNCTION app.my_session_questionnaires(p_session_id UUID)
RETURNS TABLE (
  assignment_id UUID,
  template_id UUID,
  template_title TEXT,
  kind TEXT,
  learner_name TEXT,
  status TEXT,
  created_at TIMESTAMPTZ,
  submitted_at TIMESTAMPTZ,
  score NUMERIC,
  answers JSONB,
  questions JSONB
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = app, public AS $$
  SELECT a.id, t.id, t.title, t.kind::text,
         CASE WHEN app.est_satisfaction(t.kind::text) THEN NULL
              ELSE COALESCE(NULLIF(btrim(concat_ws(' ', l.first_name, l.last_name)), ''), a.recipient_name, 'Apprenant') END,
         a.status::text, a.created_at, r.submitted_at,
         CASE WHEN app.est_satisfaction(t.kind::text) THEN NULL ELSE r.score END,
         CASE WHEN app.est_satisfaction(t.kind::text) THEN NULL ELSE r.answers END,
         CASE WHEN app.est_satisfaction(t.kind::text) THEN NULL ELSE t.schema -> 'questions' END
    FROM app.questionnaire_assignments a
    JOIN app.questionnaire_templates t ON t.id = a.template_id
    LEFT JOIN app.learners l ON l.id = a.recipient_learner_id
    LEFT JOIN app.questionnaire_responses r ON r.assignment_id = a.id
   WHERE p_session_id IN (SELECT app.my_trainer_session_ids())
     AND a.recipient_kind = 'learner'
     AND (a.session_id = p_session_id
          OR (a.session_id IS NULL AND a.dossier_id IN (
                SELECT s.dossier_id FROM app.sessions s WHERE s.id = p_session_id
                UNION
                SELECT sd.dossier_id FROM app.session_dossiers sd WHERE sd.session_id = p_session_id)))
   ORDER BY 3, 5 NULLS LAST
$$;

-- ── Évaluations reçues par le formateur ────────────────────────────────────
-- Note du formateur : questions « rating » d'une évaluation du formateur, ou
-- dont l'intitulé parle du formateur (satisfaction à chaud, q3), ramenées sur 5.
CREATE OR REPLACE FUNCTION app.my_trainer_evaluations()
RETURNS TABLE (
  formation_id UUID,
  formation_title TEXT,
  responses INT,
  satisfaction_avg NUMERIC,
  trainer_avg NUMERIC,
  last_submitted_at TIMESTAMPTZ,
  comments TEXT[]
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = app, public AS $$
  WITH reponses AS (
    SELECT r.id, r.score, r.answers, r.submitted_at, t.kind::text AS kind, t.schema, d.formation_id
      FROM app.questionnaire_responses r
      JOIN app.questionnaire_assignments a ON a.id = r.assignment_id
      JOIN app.questionnaire_templates t ON t.id = r.template_id
      JOIN app.dossiers d ON d.id = a.dossier_id
     WHERE a.recipient_kind = 'learner'
       AND t.kind::text IN ('satisfaction_chaud', 'satisfaction_formateur')
       AND (a.sent_by_trainer_id IN (SELECT app.my_trainer_ids())
            OR a.session_id IN (SELECT app.my_trainer_session_ids())
            OR a.dossier_id IN (SELECT app.my_trainer_dossier_ids()))
  ),
  notes AS (
    SELECT rep.id,
           avg((rep.answers ->> (q ->> 'id'))::numeric
               / NULLIF(COALESCE(NULLIF(q ->> 'max', '')::numeric, 5), 0) * 5) AS note
      FROM reponses rep
      CROSS JOIN LATERAL jsonb_array_elements(COALESCE(rep.schema -> 'questions', '[]'::jsonb)) q
     WHERE q ->> 'type' = 'rating'
       AND (rep.kind = 'satisfaction_formateur' OR q ->> 'label' ILIKE '%formateur%')
       AND (rep.answers ->> (q ->> 'id')) ~ '^[0-9]+(\.[0-9]+)?$'
     GROUP BY rep.id
  ),
  textes AS (
    SELECT rep.id, rep.formation_id, rep.submitted_at, btrim(rep.answers ->> (q ->> 'id')) AS texte
      FROM reponses rep
      CROSS JOIN LATERAL jsonb_array_elements(COALESCE(rep.schema -> 'questions', '[]'::jsonb)) q
     WHERE q ->> 'type' = 'text'
       AND btrim(COALESCE(rep.answers ->> (q ->> 'id'), '')) <> ''
  ),
  agg AS (
    SELECT rep.formation_id, GROUPING(rep.formation_id) AS global, count(*)::int AS n,
           avg(rep.score) / 20 AS sat, avg(n.note) AS note, max(rep.submitted_at) AS dernier
      FROM reponses rep
      LEFT JOIN notes n ON n.id = rep.id
     GROUP BY GROUPING SETS ((rep.formation_id), ())
    -- Le regroupement total produit une ligne même sans aucune réponse.
    HAVING count(*) > 0
  ),
  com AS (
    SELECT tx.formation_id, array_agg(tx.texte ORDER BY tx.submitted_at DESC) AS commentaires
      FROM textes tx
     GROUP BY tx.formation_id
  )
  SELECT CASE WHEN a.global = 1 THEN NULL ELSE a.formation_id END,
         CASE WHEN a.global = 1 THEN 'Toutes vos formations' ELSE COALESCE(f.title, 'Formation') END,
         a.n,
         CASE WHEN a.n >= 3 THEN round(a.sat, 2) END,
         CASE WHEN a.n >= 3 THEN round(a.note, 2) END,
         a.dernier,
         CASE WHEN a.n >= 3 AND a.global = 0 THEN c.commentaires END
    FROM agg a
    LEFT JOIN com c ON a.global = 0 AND c.formation_id IS NOT DISTINCT FROM a.formation_id
    LEFT JOIN app.formations f ON a.global = 0 AND f.id = a.formation_id
   ORDER BY a.global DESC, a.dernier DESC NULLS LAST
$$;

DO $$
DECLARE f TEXT;
BEGIN
  FOREACH f IN ARRAY ARRAY['app.my_session_questionnaires(uuid)', 'app.my_trainer_evaluations()'] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', f);
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
