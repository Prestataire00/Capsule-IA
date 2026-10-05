-- ============================================================================
-- Tests pgTAP : groupes portés par le client d'une séance sans dossier (0212).
-- ============================================================================
BEGIN;
SELECT plan(5);

SELECT has_column('app', 'dossier_groupes', 'company_id', 'un groupe peut appartenir au client');
SELECT col_is_null('app', 'dossier_groupes', 'dossier_id', 'un groupe peut ne pas avoir de dossier');

SELECT throws_ok(
  $$INSERT INTO app.dossier_groupes (organization_id, nom) VALUES (gen_random_uuid(), 'Groupe A')$$,
  '23514', NULL, 'un groupe a un porteur');

SELECT throws_ok(
  $$INSERT INTO app.dossier_groupes (organization_id, dossier_id, company_id, nom)
    VALUES (gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), 'Groupe A')$$,
  '23514', NULL, 'jamais à la fois un dossier et un client');

SELECT policies_are('app', 'dossier_groupes',
  ARRAY['dossier_groupes_select', 'dossier_groupes_write'], 'policies des groupes inchangées');

SELECT * FROM finish();
ROLLBACK;
