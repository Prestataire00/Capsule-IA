-- ============================================================================
-- Tests pgTAP : validation des supports de cours (0165).
-- Rien n'est diffusé par défaut, et un état inventé est refusé.
-- ============================================================================
BEGIN;
SELECT plan(7);

SELECT has_column('app', 'session_resources', 'validation_status', 'état de validation');
SELECT has_column('app', 'session_resources', 'validated_by', 'qui a tranché');
SELECT has_column('app', 'session_resources', 'validated_at', 'quand');
SELECT has_column('app', 'session_resources', 'rejection_reason', 'motif du refus');
SELECT has_column('app', 'session_resources', 'submitted_at', 'date de dépôt, pour l''ordre de la file');

-- Un support arrive « en attente » : jamais diffusé sur sa seule création.
SELECT col_default_is('app', 'session_resources', 'validation_status', 'en_attente',
  'un support déposé attend la validation');

-- Le jeu d'états est clos : pas de « publie » ni de « ok » glissés par un client.
SELECT col_has_check('app', 'session_resources', ARRAY['validation_status'],
  'seuls en_attente / valide / refuse sont acceptés');

SELECT * FROM finish();
ROLLBACK;
