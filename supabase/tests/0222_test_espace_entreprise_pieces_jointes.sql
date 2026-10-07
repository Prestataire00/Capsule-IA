BEGIN;
SELECT plan(4);

INSERT INTO app.organizations (id, name, slug, contact_email)
VALUES ('00000000-0000-0000-0000-0000000222a1', 'Org 0222', 'org-0222', 'o222@test.fr');
INSERT INTO app.companies (id, organization_id, name)
VALUES ('00000000-0000-0000-0000-0000000222b1', '00000000-0000-0000-0000-0000000222a1', 'Client 0222');
INSERT INTO app.contacts (id, organization_id, company_id, first_name, last_name)
VALUES ('00000000-0000-0000-0000-0000000222c1', '00000000-0000-0000-0000-0000000222a1', '00000000-0000-0000-0000-0000000222b1', 'Rita', 'Ref');
SET LOCAL ROLE service_role;

SELECT has_column('app', 'espace_entreprise_messages', 'pieces', 'les pièces jointes ont leur colonne');

SELECT lives_ok(
  $$INSERT INTO app.espace_entreprise_messages (organization_id, contact_id, auteur, auteur_nom, body, pieces)
    VALUES ('00000000-0000-0000-0000-0000000222a1', '00000000-0000-0000-0000-0000000222c1', 'entreprise', 'Rita', '',
            '[{"path":"echanges/x/y/z.pdf","nom":"z.pdf","mime":"application/pdf","taille":10}]')$$,
  'un message peut n''être qu''un document'
);

SELECT throws_ok(
  $$INSERT INTO app.espace_entreprise_messages (organization_id, contact_id, auteur, auteur_nom, body)
    VALUES ('00000000-0000-0000-0000-0000000222a1', '00000000-0000-0000-0000-0000000222c1', 'entreprise', 'Rita', '   ')$$,
  '23514', NULL,
  'ni texte ni document : refusé'
);

SELECT throws_ok(
  $$INSERT INTO app.espace_entreprise_messages (organization_id, contact_id, auteur, auteur_nom, body, pieces)
    VALUES ('00000000-0000-0000-0000-0000000222a1', '00000000-0000-0000-0000-0000000222c1', 'entreprise', 'Rita', 'x', '{}')$$,
  '23514', NULL,
  'pieces est toujours une liste'
);

SELECT * FROM finish();
ROLLBACK;
