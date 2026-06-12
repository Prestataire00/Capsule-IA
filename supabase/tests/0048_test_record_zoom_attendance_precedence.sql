-- ============================================================================
-- Tests pgTAP : record_zoom_attendance respecte la précédence humaine
-- ============================================================================
BEGIN;
SELECT plan(4);

SELECT tests.as_service_role();

INSERT INTO app.organizations (id, name, legal_name, siret) VALUES
  ('00aaa000-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'OF A', 'OF A SARL', '11111111111111');

INSERT INTO app.learners (id, organization_id, first_name, last_name, email) VALUES
  ('1ea00000-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '00aaa000-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Lea', 'A', 'lea-a@of.test'),
  ('1eb00000-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '00aaa000-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Leo', 'A', 'leo-a@of.test');

INSERT INTO app.dossiers (id, organization_id, reference, learner_id, status) VALUES
  ('d0a00000-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '00aaa000-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'DOS-A', '1ea00000-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'draft');

INSERT INTO app.sessions (id, organization_id, dossier_id, modality, starts_at, ends_at) VALUES
  ('5e500a00-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '00aaa000-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'd0a00000-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'distanciel', now() - interval '2 days', now() - interval '2 days' + interval '3 hours');

INSERT INTO app.attendance_sheets (id, organization_id, dossier_id, session_id, half_day, status) VALUES
  ('a5a00000-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '00aaa000-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'd0a00000-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '5e500a00-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'full', 'open');

-- Lea a déjà signé MANUELLEMENT
INSERT INTO app.attendance_signatures (
  organization_id, attendance_sheet_id, participant_kind, learner_id,
  status, signed_at, evidence_source
) VALUES (
  '00aaa000-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a5a00000-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'learner', '1ea00000-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'present', now(), 'manual'
);

-- 1) Zoom NE DOIT PAS écraser la signature manuelle de Lea
SELECT is(
  app.record_zoom_attendance(
    'a5a00000-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '1ea00000-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    'present'::app.attendance_status, 'hashLea', 'zoom_api', '{"durationMinutes": 120}'::jsonb
  ),
  'skipped_human',
  'Zoom ne remplace pas une signature manuelle'
);

SELECT is(
  (SELECT evidence_source FROM app.attendance_signatures
     WHERE attendance_sheet_id = 'a5a00000-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
       AND learner_id = '1ea00000-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  'manual',
  'La signature de Lea reste manual après tentative Zoom'
);

-- 2) Zoom REMPLIT la présence manquante de Leo
SELECT is(
  app.record_zoom_attendance(
    'a5a00000-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '1eb00000-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    'present'::app.attendance_status, 'hashLeo', 'zoom_api', '{"durationMinutes": 150}'::jsonb
  ),
  'recorded',
  'Zoom remplit une présence manquante'
);

SELECT is(
  (SELECT evidence_source FROM app.attendance_signatures
     WHERE attendance_sheet_id = 'a5a00000-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
       AND learner_id = '1eb00000-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  'zoom_api',
  'Leo a une preuve Zoom enregistrée'
);

SELECT * FROM finish();
ROLLBACK;
