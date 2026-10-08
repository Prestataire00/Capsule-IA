BEGIN;
SELECT plan(4);

INSERT INTO app.organizations (id, name, slug, contact_email)
VALUES ('00000000-0000-0000-0000-0000000226a1', 'Org 0226', 'org-0226', 'o226@test.fr');
INSERT INTO app.companies (id, organization_id, name) VALUES
  ('00000000-0000-0000-0000-0000000226c1', '00000000-0000-0000-0000-0000000226a1', 'Sandaya test');
INSERT INTO app.learners (id, organization_id, first_name, last_name, email) VALUES
  ('00000000-0000-0000-0000-0000000226b1', '00000000-0000-0000-0000-0000000226a1', 'Nohella', 'Ref', 'n226@test.fr'),
  ('00000000-0000-0000-0000-0000000226b2', '00000000-0000-0000-0000-0000000226a1', 'Gwen', 'Barbe', 'g226@test.fr'),
  ('00000000-0000-0000-0000-0000000226b3', '00000000-0000-0000-0000-0000000226a1', 'Guilhem', 'Cei', 'gc226@test.fr');
INSERT INTO app.formations (id, organization_id, code, title, slug, default_duration_hours) VALUES
  ('00000000-0000-0000-0000-0000000226f1', '00000000-0000-0000-0000-0000000226a1', 'F-226', 'IA 226', 'ia-226', 7);
INSERT INTO app.dossiers (id, organization_id, reference, learner_id, formation_id, formation_snapshot, modality, start_date, end_date, total_hours, company_id)
VALUES ('00000000-0000-0000-0000-0000000226d1', '00000000-0000-0000-0000-0000000226a1', 'DOS-226',
        '00000000-0000-0000-0000-0000000226b1', '00000000-0000-0000-0000-0000000226f1', '{}'::jsonb, 'presentiel', '2026-10-08', '2026-10-09', 7,
        '00000000-0000-0000-0000-0000000226c1');
INSERT INTO app.dossier_learners (dossier_id, learner_id, organization_id) VALUES
  ('00000000-0000-0000-0000-0000000226d1', '00000000-0000-0000-0000-0000000226b2', '00000000-0000-0000-0000-0000000226a1');
INSERT INTO app.dossier_groupes (id, organization_id, dossier_id, nom, ordre) VALUES
  ('00000000-0000-0000-0000-0000000226e1', '00000000-0000-0000-0000-0000000226a1', '00000000-0000-0000-0000-0000000226d1', 'Groupe A', 1);
INSERT INTO app.sessions (id, organization_id, dossier_id, title, starts_at, ends_at, modality, groupe_id) VALUES
  ('00000000-0000-0000-0000-000000022601', '00000000-0000-0000-0000-0000000226a1', '00000000-0000-0000-0000-0000000226d1', 'Groupe A (matin)',
   '2026-10-08 07:00+00', '2026-10-08 10:30+00', 'presentiel', '00000000-0000-0000-0000-0000000226e1');

INSERT INTO app.dossier_groupe_membres (groupe_id, learner_id, organization_id) VALUES
  ('00000000-0000-0000-0000-0000000226e1', '00000000-0000-0000-0000-0000000226b2', '00000000-0000-0000-0000-0000000226a1'),
  ('00000000-0000-0000-0000-0000000226e1', '00000000-0000-0000-0000-0000000226b3', '00000000-0000-0000-0000-0000000226a1');

SELECT ok(
  EXISTS (SELECT 1 FROM app.dossier_learners WHERE dossier_id = '00000000-0000-0000-0000-0000000226d1' AND learner_id = '00000000-0000-0000-0000-0000000226b3'),
  'un membre du groupe devient stagiaire du dossier de ses séances'
);
SELECT ok(
  EXISTS (SELECT 1 FROM app.session_expected_signers('00000000-0000-0000-0000-000000022601') WHERE participant_id = '00000000-0000-0000-0000-0000000226b3'),
  'il est attendu à l''émargement de la séance du groupe'
);
SELECT ok(
  EXISTS (SELECT 1 FROM app.dossier_apprenants('00000000-0000-0000-0000-0000000226d1') WHERE learner_id = '00000000-0000-0000-0000-0000000226b3'),
  'il compte parmi les apprenants du dossier (questionnaires, documents)'
);
SELECT is(
  (SELECT count(*)::int FROM app.dossier_learners WHERE dossier_id = '00000000-0000-0000-0000-0000000226d1'),
  2,
  'la liste existante est complétée, sans y ajouter le titulaire qui n''y figurait pas'
);

SELECT * FROM finish();
ROLLBACK;
