-- ============================================================================
-- Tests pgTAP : espace entreprise du référent (0207).
-- ============================================================================
BEGIN;
SELECT plan(4);

SELECT has_column('app', 'documents', 'visible_entreprise', 'visibilité entreprise d''un document');
SELECT col_default_is('app', 'documents', 'visible_entreprise', 'false', 'un document est interne par défaut');
SELECT col_not_null('app', 'documents', 'visible_entreprise', 'la visibilité est toujours connue');
SELECT has_column('app', 'contacts', 'espace_revoked_at', 'révocation des liens de l''espace entreprise');

SELECT * FROM finish();
ROLLBACK;
