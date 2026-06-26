-- ============================================================================
-- Tests pgTAP : dossiers.modalities — backfill + CHECK invariant
-- ============================================================================
BEGIN;
SELECT plan(3);

SELECT tests.as_service_role();

INSERT INTO app.organizations (id, name, legal_name, siret) VALUES
  ('00aaa000-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'OF A', 'OF A SARL', '11111111111111');
INSERT INTO app.learners (id, organization_id, first_name, last_name, email) VALUES
  ('1ea00000-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '00aaa000-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Lea', 'A', 'lea@of.test');

-- Formation minimale pour l'org (colonnes NOT NULL sans default : code, title, slug, default_duration_hours)
INSERT INTO app.formations (id, organization_id, code, title, slug, default_duration_hours) VALUES
  ('f0a00000-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '00aaa000-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'FORM-MM-1', 'Formation MM', 'formation-mm', 1);

-- Un dossier scalaire 'presentiel' (modalities prend le DEFAULT '{}' à l'insert,
-- puis on simule le backfill comme la migration le fait)
INSERT INTO app.dossiers (id, organization_id, reference, learner_id, formation_id, formation_snapshot, status, modality, start_date, end_date, total_hours)
SELECT 'd0a00000-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '00aaa000-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'DOS-MM-1', '1ea00000-aaaa-aaaa-aaaa-aaaaaaaaaaaa', f.id, '{}'::jsonb, 'draft', 'presentiel', now()::date, now()::date, 1
  FROM app.formations f WHERE f.organization_id = '00aaa000-aaaa-aaaa-aaaa-aaaaaaaaaaaa' LIMIT 1;
UPDATE app.dossiers SET modalities = ARRAY[modality] WHERE id = 'd0a00000-aaaa-aaaa-aaaa-aaaaaaaaaaaa' AND cardinality(modalities) = 0;

SELECT is(
  (SELECT modalities FROM app.dossiers WHERE id = 'd0a00000-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  ARRAY['presentiel']::app.training_modality[],
  'Backfill : modalities reflète le scalaire');

-- Mettre un ensemble valide incluant la primaire : OK
UPDATE app.dossiers SET modalities = ARRAY['presentiel','distanciel']::app.training_modality[]
  WHERE id = 'd0a00000-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
SELECT is(
  (SELECT cardinality(modalities) FROM app.dossiers WHERE id = 'd0a00000-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  2, 'Ensemble valide accepté (primaire incluse)');

-- Primaire hors ensemble : rejeté par le CHECK
SELECT throws_ok(
  $$ UPDATE app.dossiers SET modalities = ARRAY['distanciel','hybride']::app.training_modality[]
     WHERE id = 'd0a00000-aaaa-aaaa-aaaa-aaaaaaaaaaaa' $$,
  '23514',
  NULL,
  'CHECK rejette une primaire (presentiel) hors de modalities');

SELECT * FROM finish();
ROLLBACK;
