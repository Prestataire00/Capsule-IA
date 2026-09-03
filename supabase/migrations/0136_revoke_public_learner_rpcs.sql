-- 0136 — Rattrapage : la migration 0130 ne fermait rien.
--
-- 0130 révoquait `EXECUTE` au seul rôle `anon`. Or PostgreSQL accorde
-- l'exécution d'une fonction à **PUBLIC** par défaut, à sa création. `anon`
-- hérite de PUBLIC : retirer son droit explicite le laisse donc passer par
-- l'héritage. Vérifié en production après application de 0130 — les quatre RPC
-- apprenant répondaient toujours HTTP 200 à un appel anonyme.
--
-- La migration 0127, écrite avant l'audit, procédait correctement :
-- `REVOKE ALL ON FUNCTION … FROM PUBLIC`.
--
-- On retire aussi le droit à `authenticated`. Ces fonctions sont
-- `SECURITY DEFINER` et n'ont pour seule autorisation qu'un UUID d'apprenant :
-- un membre d'un autre organisme pouvait y lire le tableau de bord de n'importe
-- quel apprenant de la plateforme — même faiblesse que celle corrigée sur les
-- seaux de stockage en 0133. Les appelants légitimes passent tous par le service
-- role depuis le 2026-08-30.

REVOKE ALL ON FUNCTION app.get_apprenant_dashboard(UUID)              FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION app.get_learner_complaints(UUID)               FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION app.get_apprenant_resources(UUID)              FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION app.get_apprenant_exercises(UUID)              FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION app.get_signature_context(UUID, UUID, TEXT)    FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION app.get_apprenant_dashboard(UUID)           TO service_role;
GRANT EXECUTE ON FUNCTION app.get_learner_complaints(UUID)            TO service_role;
GRANT EXECUTE ON FUNCTION app.get_apprenant_resources(UUID)           TO service_role;
GRANT EXECUTE ON FUNCTION app.get_apprenant_exercises(UUID)           TO service_role;
GRANT EXECUTE ON FUNCTION app.get_signature_context(UUID, UUID, TEXT) TO service_role;

NOTIFY pgrst, 'reload schema';
