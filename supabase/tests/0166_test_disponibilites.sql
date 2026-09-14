-- ============================================================================
-- Tests pgTAP : disponibilités des formateurs (0166).
-- RLS forcée, écriture réservée au service role, une seule réponse par créneau.
-- ============================================================================
BEGIN;
SELECT plan(8);

SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid = 'app.trainer_availability'::regclass), 'RLS activée');
SELECT ok((SELECT relforcerowsecurity FROM pg_class WHERE oid = 'app.trainer_availability'::regclass), 'RLS forcée');

SELECT policies_are('app', 'trainer_availability',
  ARRAY['trainer_availability_select', 'trainer_availability_write'], 'policies des disponibilités');

SELECT has_column('app', 'trainer_availability', 'slot', 'créneau déclaré');
SELECT has_column('app', 'trainer_availability', 'kind', 'disponible ou indisponible');
SELECT has_column('app', 'trainer_availability', 'note', 'motif facultatif');

-- Deux avis contradictoires pour le même formateur, le même jour et le même
-- créneau n'ont pas de sens : re-déclarer doit remplacer, pas empiler.
SELECT col_is_unique('app', 'trainer_availability', ARRAY['trainer_id', 'day', 'slot'],
  'une seule déclaration par formateur, jour et créneau');

-- Un membre sans service role n'écrit pas directement : les Server Actions
-- vérifient d'abord que la fiche appartient bien au compte connecté.
SELECT tests.set_jwt('00000000-0000-0000-0000-00000000000a'::uuid, 'formateur',
                     '00000000-0000-0000-0000-0000000000f1'::uuid);
SELECT tests.as_authenticated();

SELECT throws_ok(
  $$INSERT INTO app.trainer_availability (organization_id, trainer_id, day, slot, kind)
    VALUES ('00000000-0000-0000-0000-00000000000a'::uuid, gen_random_uuid(), CURRENT_DATE, 'journee', 'indisponible')$$,
  '42501', NULL, 'pas de déclaration directe en base');

SELECT * FROM finish();
ROLLBACK;
