-- ============================================================================
-- Tests pgTAP : pré-inscription — enum financeur étendu + multi-financement
-- ============================================================================
BEGIN;
SELECT plan(3);

SELECT tests.as_service_role();

INSERT INTO app.organizations (id, name, legal_name, siret) VALUES
  ('00aaa000-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'OF A', 'OF A SARL', '11111111111111');

-- (1) Les valeurs d'enum étendues sont castables
SELECT lives_ok(
  $$ SELECT 'faf_ca'::app.funder_kind, 'agefiph'::app.funder_kind $$,
  'faf_ca et agefiph sont des valeurs valides de app.funder_kind'
);

-- (2) Insertion d'un prospect avec multi-financement + champs entreprise/référent
SELECT lives_ok(
  $$ INSERT INTO app.prospects
       (organization_id, first_name, last_name, email, situation, funder_kind,
        funder_kinds, company_siret, referent_name)
     VALUES
       ('00aaa000-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Marie', 'Durand',
        'marie@p.test', 'salarie', 'opco',
        ARRAY['opco','agefiph']::app.funder_kind[], '33333333333333', 'Jean Référent') $$,
  'Insertion prospect avec funder_kinds multi + company_siret + referent_name'
);

-- (3) Le tableau de financements porte bien 2 valeurs
SELECT is(
  (SELECT cardinality(funder_kinds) FROM app.prospects WHERE email = 'marie@p.test'),
  2,
  'funder_kinds contient 2 financements'
);

SELECT * FROM finish();
ROLLBACK;
