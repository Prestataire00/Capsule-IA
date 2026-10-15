BEGIN;
SELECT plan(4);

SELECT has_column('app', 'organizations', 'bank_iban', 'l’IBAN de l’organisme');

INSERT INTO app.organizations (id, name, slug, contact_email) VALUES ('00000000-0000-0000-0000-00000000b228', 'Banque test', 'banque-test-0228', 'b228@test.fr');

SELECT lives_ok(
  $$UPDATE app.organizations SET bank_iban = 'FR7616958000010169186147385', bank_bic = 'QNTOFRP1XXX', bank_name = 'Qonto'
    WHERE id = '00000000-0000-0000-0000-00000000b228'$$,
  'un IBAN et un BIC bien formés passent'
);
SELECT throws_ok(
  $$UPDATE app.organizations SET bank_iban = 'FR76 1695 8000' WHERE id = '00000000-0000-0000-0000-00000000b228'$$,
  '23514', NULL,
  'un IBAN avec espaces ou tronqué est refusé'
);
SELECT throws_ok(
  $$UPDATE app.organizations SET bank_bic = 'QNTO' WHERE id = '00000000-0000-0000-0000-00000000b228'$$,
  '23514', NULL,
  'un BIC incomplet est refusé'
);

SELECT * FROM finish();
ROLLBACK;
