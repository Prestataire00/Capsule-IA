-- ============================================================================
-- Tests pgTAP : les dates d'un dossier suivent ses séances (0189).
--
-- Le cas d'origine : un dossier né d'une demande recevait `end_date =
-- start_date`, et rien ne le corrigeait. Une formation de cinq jours naissait
-- sur un seul, ce qui avançait de quatre jours les envois de fin de formation.
-- ============================================================================
BEGIN;
SELECT plan(5);

SELECT has_function('app', 'recalculer_dates_dossier', ARRAY['uuid'], 'la fonction de recalcul existe');
SELECT has_trigger('app', 'sessions', 'tg_dates_dossier_depuis_session', 'trigger sur les séances');
SELECT has_trigger('app', 'session_dossiers', 'tg_dates_dossier_depuis_liaison', 'trigger sur la liaison');

-- La fonction écrit sur app.dossiers, dont la RLS est forcée : sans
-- SECURITY DEFINER, planifier une séance échouerait pour tout le monde.
-- C'est exactement l'oubli qui avait bloqué la production le 2026-09-14.
SELECT ok(
  (SELECT prosecdef FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'app' AND p.proname = 'recalculer_dates_dossier'),
  'recalculer_dates_dossier est SECURITY DEFINER');

SELECT ok(
  (SELECT proconfig::text LIKE '%search_path%' FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'app' AND p.proname = 'recalculer_dates_dossier'),
  'son search_path est figé');

SELECT * FROM finish();
ROLLBACK;

-- Le comportement (début = première séance, fin = dernière) n'est pas éprouvé
-- ici : monter les fixtures d'un dossier complet (organisation, apprenant,
-- formation, snapshot, heures) dépasse ce que ce fichier peut vérifier
-- utilement. Il l'est en production, juste après application, en posant une
-- séance sur un dossier et en relisant ses dates.
