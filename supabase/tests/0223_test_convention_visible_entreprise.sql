BEGIN;
SELECT plan(3);

INSERT INTO app.organizations (id, name, slug, contact_email)
VALUES ('00000000-0000-0000-0000-0000000223a1', 'Org 0223', 'org-0223', 'o223@test.fr');
INSERT INTO app.learners (id, organization_id, first_name, last_name, email)
VALUES ('00000000-0000-0000-0000-0000000223b1', '00000000-0000-0000-0000-0000000223a1', 'Léa', 'Test', 'lea223@test.fr');
INSERT INTO app.formations (id, organization_id, code, title, slug, default_duration_hours)
VALUES ('00000000-0000-0000-0000-0000000223e1', '00000000-0000-0000-0000-0000000223a1', 'F-223', 'Formation 223', 'formation-223', 7);
INSERT INTO app.dossiers (id, organization_id, reference, learner_id, formation_id, formation_snapshot, modality, start_date, end_date, total_hours)
VALUES ('00000000-0000-0000-0000-0000000223d1', '00000000-0000-0000-0000-0000000223a1', 'DOS-223',
        '00000000-0000-0000-0000-0000000223b1', '00000000-0000-0000-0000-0000000223e1', '{}'::jsonb, 'presentiel', '2026-11-01', '2026-11-01', 7);

INSERT INTO app.documents (id, organization_id, dossier_id, kind, title, status) VALUES
  ('00000000-0000-0000-0000-0000000223c1', '00000000-0000-0000-0000-0000000223a1', '00000000-0000-0000-0000-0000000223d1', 'convention', 'Convention', 'ready'),
  ('00000000-0000-0000-0000-0000000223c2', '00000000-0000-0000-0000-0000000223a1', '00000000-0000-0000-0000-0000000223d1', 'programme', 'Programme', 'ready');

SELECT ok((SELECT visible_entreprise FROM app.documents WHERE id = '00000000-0000-0000-0000-0000000223c1'),
  'une nouvelle convention est visible dans l''espace entreprise');
SELECT ok(NOT (SELECT visible_entreprise FROM app.documents WHERE id = '00000000-0000-0000-0000-0000000223c2'),
  'les autres documents restent internes par défaut');

UPDATE app.documents SET visible_entreprise = false WHERE id = '00000000-0000-0000-0000-0000000223c1';
SELECT ok(NOT (SELECT visible_entreprise FROM app.documents WHERE id = '00000000-0000-0000-0000-0000000223c1'),
  'on peut ensuite la repasser en interne');

SELECT * FROM finish();
ROLLBACK;
