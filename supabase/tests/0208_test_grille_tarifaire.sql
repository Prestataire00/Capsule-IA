-- ============================================================================
-- Tests pgTAP : grille tarifaire de l'organisme (0208).
-- ============================================================================
BEGIN;
SELECT plan(2);

SELECT has_column('app', 'organizations', 'grille_tarifaire', 'grille tarifaire de l''organisme');
SELECT col_is_null('app', 'organizations', 'grille_tarifaire', 'sans réglage, la grille de départ s''applique');

SELECT * FROM finish();
ROLLBACK;
