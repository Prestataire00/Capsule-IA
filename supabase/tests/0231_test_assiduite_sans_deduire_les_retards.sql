BEGIN;
SELECT plan(3);

-- Une séance passée de 13:30 à 17:00 : Nohella arrive à 13:45 (retard), Léo
-- part à 16:00 (départ anticipé). Le retard ne retire rien, le départ si.
INSERT INTO app.organizations (id, name, slug, contact_email)
VALUES ('00000000-0000-0000-0000-0000000231a1', 'Org 0231', 'org-0231', 'o231@test.fr');
INSERT INTO app.formations (id, organization_id, code, title, slug, default_duration_hours) VALUES
  ('00000000-0000-0000-0000-0000000231c1', '00000000-0000-0000-0000-0000000231a1', 'F-231', 'F 231', 'f-231', 3.5);
INSERT INTO app.learners (id, organization_id, first_name, last_name) VALUES
  ('00000000-0000-0000-0000-0000000231b1', '00000000-0000-0000-0000-0000000231a1', 'Nohella', 'Test'),
  ('00000000-0000-0000-0000-0000000231b2', '00000000-0000-0000-0000-0000000231a1', 'Léo', 'Test');
INSERT INTO app.dossiers (id, organization_id, reference, learner_id, formation_id, formation_snapshot, modality, start_date, end_date, total_hours) VALUES
  ('00000000-0000-0000-0000-0000000231d1', '00000000-0000-0000-0000-0000000231a1', 'DOS-231-1', '00000000-0000-0000-0000-0000000231b1', '00000000-0000-0000-0000-0000000231c1', '{}', 'presentiel', '2026-10-09', '2026-10-09', 3.5),
  ('00000000-0000-0000-0000-0000000231d2', '00000000-0000-0000-0000-0000000231a1', 'DOS-231-2', '00000000-0000-0000-0000-0000000231b2', '00000000-0000-0000-0000-0000000231c1', '{}', 'presentiel', '2026-10-09', '2026-10-09', 3.5);
INSERT INTO app.sessions (id, organization_id, formation_id, title, starts_at, ends_at, modality, status) VALUES
  ('00000000-0000-0000-0000-000000023101', '00000000-0000-0000-0000-0000000231a1', '00000000-0000-0000-0000-0000000231c1', 'Séance 231', '2026-10-09 11:30+00', '2026-10-09 15:00+00', 'presentiel', 'done');
INSERT INTO app.session_dossiers (organization_id, session_id, dossier_id) VALUES
  ('00000000-0000-0000-0000-0000000231a1', '00000000-0000-0000-0000-000000023101', '00000000-0000-0000-0000-0000000231d1'),
  ('00000000-0000-0000-0000-0000000231a1', '00000000-0000-0000-0000-000000023101', '00000000-0000-0000-0000-0000000231d2')
ON CONFLICT DO NOTHING;
INSERT INTO app.attendance_sheets (organization_id, session_id, half_day)
VALUES ('00000000-0000-0000-0000-0000000231a1', '00000000-0000-0000-0000-000000023101', 'afternoon')
ON CONFLICT (session_id, half_day) DO NOTHING;

INSERT INTO app.attendance_signatures (organization_id, attendance_sheet_id, participant_kind, learner_id, status, late_arrival_time, early_departure_time)
SELECT '00000000-0000-0000-0000-0000000231a1', sh.id, 'learner', v.learner, v.status::app.attendance_status, v.late::time, v.early::time
FROM app.attendance_sheets sh,
     (VALUES ('00000000-0000-0000-0000-0000000231b1'::uuid, 'late', '13:45', NULL),
             ('00000000-0000-0000-0000-0000000231b2'::uuid, 'present', NULL, '16:00')) AS v(learner, status, late, early)
WHERE sh.session_id = '00000000-0000-0000-0000-000000023101';

SELECT ok((SELECT COUNT(*) FROM app.attendance_sheets WHERE session_id = '00000000-0000-0000-0000-000000023101') >= 1, 'une feuille pour la séance');

SELECT app.recompute_dossier_hours('00000000-0000-0000-0000-0000000231d1');
SELECT app.recompute_dossier_hours('00000000-0000-0000-0000-0000000231d2');

SELECT is(
  (SELECT attendance_rate FROM app.dossier_hours_tracking WHERE dossier_id = '00000000-0000-0000-0000-0000000231d1'),
  100.00::numeric,
  'en retard mais présente : 100 % d’assiduité'
);
SELECT ok(
  (SELECT attendance_rate FROM app.dossier_hours_tracking WHERE dossier_id = '00000000-0000-0000-0000-0000000231d2') < 100,
  'un départ anticipé reste déduit'
);

SELECT * FROM finish();
ROLLBACK;
