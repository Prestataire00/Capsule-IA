-- ============================================================================
-- Tests pgTAP : plusieurs apprenants par dossier (0175).
-- RLS forcée, écriture réservée au service role, pas de doublon.
-- ============================================================================
BEGIN;
SELECT plan(6);

SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid = 'app.dossier_learners'::regclass), 'RLS activée');
SELECT ok((SELECT relforcerowsecurity FROM pg_class WHERE oid = 'app.dossier_learners'::regclass), 'RLS forcée');

SELECT policies_are('app', 'dossier_learners',
  ARRAY['dossier_learners_select', 'dossier_learners_write'], 'policies du groupe');

-- La clé primaire empêche d'inscrire deux fois la même personne : réinscrire
-- doit être sans effet, pas créer une ligne de plus.
SELECT col_is_pk('app', 'dossier_learners', ARRAY['dossier_id', 'learner_id'],
  'un stagiaire n''est inscrit qu''une fois par dossier');

SELECT has_column('app', 'dossier_learners', 'organization_id', 'cloisonnement par organisation');

-- Un membre ne peut pas écrire directement : les Server Actions gardent le
-- rôle et l'organisation avant d'écrire en service role.
SELECT tests.set_jwt('00000000-0000-0000-0000-00000000000a'::uuid, 'gestionnaire',
                     '00000000-0000-0000-0000-0000000000f1'::uuid);
SELECT tests.as_authenticated();

SELECT throws_ok(
  $$INSERT INTO app.dossier_learners (dossier_id, learner_id, organization_id)
    VALUES (gen_random_uuid(), gen_random_uuid(), '00000000-0000-0000-0000-00000000000a'::uuid)$$,
  '42501', NULL, 'pas d''inscription directe en base');

SELECT * FROM finish();
ROLLBACK;
