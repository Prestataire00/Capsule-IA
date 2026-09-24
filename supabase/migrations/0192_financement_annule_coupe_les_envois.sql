-- « Annulé » rejoint les statuts d'une ligne de financement.
--
-- Demande de Laurie en réunion du 21/09/2026 : disposer d'un statut qui arrête
-- les processus et les e-mails automatiques quand l'affaire s'arrête. Les cinq
-- statuts existants ne disaient pas ce cas : « Refusé » est la réponse du
-- financeur, « Annulé » est l'abandon de la demande — on ne l'a pas déposée, ou
-- on l'a retirée. Les confondre aurait rendu illisible le suivi des refus, qui
-- sert à savoir ce qui reste à facturer au client.
--
-- La conséquence s'écrit dans l'application : un dossier dont toutes les lignes
-- de financement sont refusées ou annulées ne déclenche plus d'envoi
-- automatique. La règle y est calculée, non stockée : revenir sur un statut
-- rend aussitôt les envois, sans qu'un drapeau oublié ne les retienne.

ALTER TABLE app.dossier_funders DROP CONSTRAINT IF EXISTS dossier_funders_status_check;

ALTER TABLE app.dossier_funders
  ADD CONSTRAINT dossier_funders_status_check
  CHECK (status IN ('pending', 'submitted', 'approved', 'refused', 'paid', 'cancelled'));

COMMENT ON COLUMN app.dossier_funders.status IS
  'Où en est la prise en charge. « refused » = le financeur a dit non ; « cancelled » = la demande a été abandonnée. Dans les deux cas, si aucune autre ligne du dossier n''est encore en jeu, les envois automatiques du dossier s''arrêtent.';
