-- ============================================================================
-- Tests pgTAP : l'émargement s'ouvre à l'heure de la séance (0209).
-- ============================================================================
BEGIN;
SELECT plan(3);

SELECT ok(
  position('60 minutes' IN pg_get_functiondef('app.record_attendance_step(uuid, uuid, text, text, text, text, inet, text, character, uuid, text, uuid)'::regprocedure)) = 0,
  'plus d''entrée signée une heure avant le début');
SELECT ok(
  position('v_now < v_win.window_start OR v_now > v_win.window_end' IN pg_get_functiondef('app.record_attendance_step(uuid, uuid, text, text, text, text, inet, text, character, uuid, text, uuid)'::regprocedure)) > 0,
  'l''entrée s''ouvre à l''heure de début');
SELECT ok(
  NOT has_function_privilege('authenticated', 'app.record_attendance_step(uuid, uuid, text, text, text, text, inet, text, character, uuid, text, uuid)', 'EXECUTE'),
  'la signature reste réservée au serveur');

SELECT * FROM finish();
ROLLBACK;
