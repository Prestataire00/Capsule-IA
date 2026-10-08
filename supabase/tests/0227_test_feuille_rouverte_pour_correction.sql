BEGIN;
SELECT plan(5);

INSERT INTO app.organizations (id, name, slug, contact_email)
VALUES ('00000000-0000-0000-0000-0000000227a1', 'Org 0227', 'org-0227', 'o227@test.fr');
INSERT INTO auth.users (id, email, instance_id, aud, role) VALUES
  ('00000000-0000-0000-0000-0000000227f1', 'dir227@of.test', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');
INSERT INTO app.formations (id, organization_id, code, title, slug, default_duration_hours) VALUES
  ('00000000-0000-0000-0000-0000000227c1', '00000000-0000-0000-0000-0000000227a1', 'F-227', 'F 227', 'f-227', 7);
INSERT INTO app.sessions (id, organization_id, formation_id, title, starts_at, ends_at, modality) VALUES
  ('00000000-0000-0000-0000-000000022701', '00000000-0000-0000-0000-0000000227a1', '00000000-0000-0000-0000-0000000227c1', 'Séance 227', '2026-10-08 07:00+00', '2026-10-08 10:30+00', 'presentiel');
-- La feuille du matin naît avec la séance : on la clôt.
INSERT INTO app.attendance_sheets (organization_id, session_id, half_day)
VALUES ('00000000-0000-0000-0000-0000000227a1', '00000000-0000-0000-0000-000000022701', 'morning')
ON CONFLICT (session_id, half_day) DO NOTHING;
UPDATE app.attendance_sheets SET id = '00000000-0000-0000-0000-0000000227e1', status = 'finalized', finalized_at = now()
WHERE session_id = '00000000-0000-0000-0000-000000022701' AND half_day = 'morning';

SELECT throws_ok(
  $$UPDATE app.attendance_sheets SET status = 'open' WHERE id = '00000000-0000-0000-0000-0000000227e1'$$,
  'P0010', NULL, 'une feuille clôturée reste verrouillée hors de la réouverture'
);
SELECT throws_ok(
  $$SELECT app.rouvrir_feuille_pour_correction('00000000-0000-0000-0000-0000000227e1', '00000000-0000-0000-0000-0000000227f1', '  ')$$,
  'P0001', 'reason_required', 'un motif est obligatoire'
);
SELECT lives_ok(
  $$SELECT app.rouvrir_feuille_pour_correction('00000000-0000-0000-0000-0000000227e1', '00000000-0000-0000-0000-0000000227f1', 'Présence constatée par le formateur')$$,
  'la réouverture pour correction passe'
);
SELECT is((SELECT status::text FROM app.attendance_sheets WHERE id = '00000000-0000-0000-0000-0000000227e1'), 'open', 'la feuille est rouverte');
SELECT ok(
  EXISTS (SELECT 1 FROM audit.audit_log WHERE row_id = '00000000-0000-0000-0000-0000000227e1' AND after->>'motif' = 'Présence constatée par le formateur'),
  'le motif est au journal d''audit'
);

SELECT * FROM finish();
ROLLBACK;
