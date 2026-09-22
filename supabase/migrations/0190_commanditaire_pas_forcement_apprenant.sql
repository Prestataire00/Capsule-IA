-- Celui qui commande la formation n'est pas toujours celui qui la suit.
--
-- Une demande recueille une personne — nom, e-mail, téléphone — et la
-- conversion en faisait systématiquement le titulaire apprenant du dossier.
-- Or c'est souvent le responsable qui appelle pour inscrire ses équipes : il
-- se retrouvait compté comme stagiaire, dans les effectifs, sur les
-- émargements et au BPF, sans jamais avoir mis les pieds en formation.
--
-- La colonne dit simplement ce que l'organisme sait déjà au moment de la
-- saisie. `true` par défaut : c'est le comportement actuel, et la majorité des
-- demandes individuelles où le candidat s'inscrit lui-même.

ALTER TABLE app.prospects
  ADD COLUMN IF NOT EXISTS candidate_is_learner BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN app.prospects.candidate_is_learner IS
  'La personne de la demande suit-elle la formation ? false = commanditaire seul, le dossier reçoit un titulaire provisoire et elle en devient le référent.';
