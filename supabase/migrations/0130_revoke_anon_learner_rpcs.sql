-- 0130 — Ferme à `anon` les RPC qui prennent un UUID pour seule autorisation.
--
-- Constat (audit 2026-08-30, CAP-13) : cinq fonctions SECURITY DEFINER étaient
-- exécutables depuis Internet avec la clé `anon` — publique, embarquée dans le
-- bundle navigateur. Leur seul contrôle d'accès était la connaissance d'un UUID
-- d'apprenant (ou de feuille d'émargement).
--
-- Or cet UUID n'est pas un secret : il est inscrit en clair dans la charge utile
-- base64 du jeton de l'espace apprenant. Quiconque détient un lien — y compris
-- un lien EXPIRÉ, un lien transféré, une capture d'écran — en extrait l'UUID et
-- interroge la base directement, sans jeton et sans limite de durée.
-- L'expiration des liens ne protégeait donc rien.
--
-- Vérifié en production le 2026-08-30 : les quatre RPC apprenant répondaient
-- HTTP 200 à un appel anonyme.
--
-- Les appelants légitimes (espace apprenant, page de signature) sont passés au
-- service role dans le même lot — ce retrait ne casse aucun parcours.
-- Les RPC du catalogue public (`public.get_published_*`) restent ouvertes à
-- `anon` : elles ne servent que des données déjà publiées.

REVOKE EXECUTE ON FUNCTION app.get_apprenant_dashboard(UUID) FROM anon;
REVOKE EXECUTE ON FUNCTION app.get_learner_complaints(UUID) FROM anon;
REVOKE EXECUTE ON FUNCTION app.get_apprenant_resources(UUID) FROM anon;
REVOKE EXECUTE ON FUNCTION app.get_apprenant_exercises(UUID) FROM anon;
REVOKE EXECUTE ON FUNCTION app.get_signature_context(UUID, UUID, TEXT) FROM anon;

-- Le service role doit pouvoir les exécuter (il ne l'avait pas partout).
GRANT EXECUTE ON FUNCTION app.get_apprenant_dashboard(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION app.get_learner_complaints(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION app.get_apprenant_resources(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION app.get_signature_context(UUID, UUID, TEXT) TO service_role;
