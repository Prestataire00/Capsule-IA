BEGIN;
SELECT plan(3);

-- Le rattrapage de 0230 rejoué sur deux dossiers : l'un comme Serra Paysage
-- (OPCO à 100 %), l'autre où l'OPCO ne couvre qu'une partie (non touché).
INSERT INTO app.organizations (id, name, slug, contact_email)
VALUES ('00000000-0000-0000-0000-0000000230a1', 'Org 0230', 'org-0230', 'o230@test.fr');
INSERT INTO app.funders (id, organization_id, kind, name)
VALUES ('00000000-0000-0000-0000-0000000230f1', '00000000-0000-0000-0000-0000000230a1', 'opco', 'OPCO 0230');

CREATE TEMP TABLE d230 AS
SELECT id FROM app.dossiers WHERE deleted_at IS NULL ORDER BY created_at LIMIT 2;
SELECT ok((SELECT COUNT(*) FROM d230) = 2, 'deux dossiers de travail');

UPDATE app.dossiers SET total_amount_cents = 500000 WHERE id IN (SELECT id FROM d230);
DELETE FROM app.dossier_funders WHERE dossier_id IN (SELECT id FROM d230);
UPDATE app.invoices SET deleted_at = now() WHERE dossier_id IN (SELECT id FROM d230);

INSERT INTO app.invoices (id, organization_id, reference, dossier_id, status, subtotal_cents, total_cents, kind)
SELECT ('00000000-0000-0000-0000-0000000230b' || n)::uuid, d.organization_id, 'PROV-230-' || n, d.id, 'draft', 500000, 500000, 'invoice'
FROM (SELECT id, organization_id, row_number() OVER (ORDER BY id) AS n FROM app.dossiers WHERE id IN (SELECT id FROM d230)) d;
INSERT INTO app.dossier_funders (organization_id, dossier_id, funder_id, amount_cents)
SELECT organization_id, id, '00000000-0000-0000-0000-0000000230f1',
       CASE WHEN id = (SELECT MIN(id::text)::uuid FROM d230) THEN 500000 ELSE 300000 END
FROM app.dossiers WHERE id IN (SELECT id FROM d230);

SELECT app.rattraper_brouillons_vers_financeur();

SELECT is(
  (SELECT funder_id FROM app.invoices WHERE dossier_id = (SELECT MIN(id::text)::uuid FROM d230) AND deleted_at IS NULL),
  '00000000-0000-0000-0000-0000000230f1'::uuid,
  'OPCO à 100 % : le brouillon de l’entreprise passe au financeur'
);
SELECT is(
  (SELECT funder_id FROM app.invoices WHERE dossier_id = (SELECT MAX(id::text)::uuid FROM d230) AND deleted_at IS NULL),
  NULL,
  'OPCO partiel : laissé à l’application, qui scinde au prochain changement'
);

SELECT * FROM finish();
ROLLBACK;
