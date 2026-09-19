-- Un stagiaire peut ne pas avoir d'adresse e-mail.
--
-- `learners.email` était NOT NULL depuis l'origine. Or une commande intra
-- arrive souvent avec les seuls noms des salariés : l'écran d'inscription
-- l'annonçait d'ailleurs — « sans e-mail, ni convocation ni lien d'émargement
-- ne partiront » — mais l'insertion échouait, et l'utilisateur lisait « aucun
-- apprenant n'a pu être enregistré » sans savoir pourquoi.
--
-- Le code d'envoi était déjà écrit pour ce cas : `sendNeedsAnalysis` renvoie
-- `no_email`, l'envoi des liens d'émargement range ces personnes dans
-- `withoutEmail`. C'était la contrainte qui était en trop, pas le code.
--
-- L'index unique `ux_learners_org_email` reste valable : PostgreSQL considère
-- deux NULL comme distincts, plusieurs stagiaires sans adresse cohabitent donc
-- dans la même organisation.

ALTER TABLE app.learners ALTER COLUMN email DROP NOT NULL;

COMMENT ON COLUMN app.learners.email IS
  'Adresse du stagiaire. Facultative depuis la 0176 : sans elle, aucun envoi automatique ne le concerne (convocation, fiche besoin, lien d''émargement, accès à son espace).';
