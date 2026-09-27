-- ============================================================================
-- Tests pgTAP : questionnaires programmés sur une séance (0197).
-- ============================================================================
BEGIN;
SELECT plan(8);

SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid = 'app.session_questionnaires'::regclass), 'RLS activée');
SELECT ok((SELECT relforcerowsecurity FROM pg_class WHERE oid = 'app.session_questionnaires'::regclass), 'RLS forcée');

SELECT policies_are('app', 'session_questionnaires',
  ARRAY['session_questionnaires_read', 'session_questionnaires_write'], 'policies des questionnaires de séance');

-- Cocher deux fois le même modèle sur la même séance n'a pas de sens.
SELECT col_is_unique('app', 'session_questionnaires', ARRAY['session_id', 'template_id'],
  'un modèle au plus une fois par séance');

SELECT has_column('app', 'session_questionnaires', 'sent_at', 'l''envoi est tracé');
SELECT has_column('app', 'questionnaire_templates', 'audience', 'destinataire du modèle');

SELECT tests.set_jwt('00000000-0000-0000-0000-00000000000a'::uuid, 'formateur',
                     '00000000-0000-0000-0000-0000000000f1'::uuid);
SELECT tests.as_authenticated();

SELECT throws_ok(
  $$INSERT INTO app.session_questionnaires (organization_id, session_id, template_id, ancre, decalage_jours)
    VALUES ('00000000-0000-0000-0000-00000000000a'::uuid, gen_random_uuid(), gen_random_uuid(), 'debut', -7)$$,
  '42501', NULL, 'pas de programmation directe en base');

SELECT is((SELECT count(*)::int FROM app.session_questionnaires
            WHERE organization_id <> '00000000-0000-0000-0000-00000000000a'::uuid),
          0, 'aucune programmation d''un autre organisme n''est lisible');

SELECT * FROM finish();
ROLLBACK;
