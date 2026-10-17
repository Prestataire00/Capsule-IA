BEGIN;
SELECT plan(5);

CREATE TEMP TABLE d232 AS SELECT id FROM app.dossiers WHERE deleted_at IS NULL ORDER BY created_at LIMIT 1;
UPDATE app.dossiers SET status = 'draft', cancelled_at = NULL WHERE id = (SELECT id FROM d232);

SELECT lives_ok(
  $$UPDATE app.dossiers SET status = 'completed' WHERE id = (SELECT id FROM d232)$$,
  'brouillon → terminé en un seul changement'
);
SELECT lives_ok(
  $$UPDATE app.dossiers SET status = 'scheduled' WHERE id = (SELECT id FROM d232)$$,
  'terminé → planifié : retour en arrière permis'
);
SELECT lives_ok(
  $$UPDATE app.dossiers SET status = 'cancelled' WHERE id = (SELECT id FROM d232)$$,
  'planifié → annulé'
);
UPDATE app.dossiers SET status = 'active' WHERE id = (SELECT id FROM d232);
SELECT is(
  (SELECT cancelled_at FROM app.dossiers WHERE id = (SELECT id FROM d232)),
  NULL,
  'réactivé : la date d’annulation est effacée'
);
SELECT ok(
  (SELECT COUNT(*) FROM app.dossier_status_history WHERE dossier_id = (SELECT id FROM d232) AND to_status = 'completed') >= 1,
  'chaque changement reste tracé'
);

SELECT * FROM finish();
ROLLBACK;
