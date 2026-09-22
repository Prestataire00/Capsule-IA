-- Le titulaire d'un dossier n'est pas forcément un stagiaire.
--
-- `dossiers.learner_id` porte deux rôles à la fois : à qui le dossier
-- appartient, et qui suit la formation. Pour une inscription individuelle les
-- deux coïncident. Pour une commande — un responsable qui inscrit son équipe —
-- ils divergent : la personne reste le titulaire et le référent du dossier,
-- mais elle n'a jamais mis les pieds en formation.
--
-- La 0186 dérive déjà les apprenants d'un dossier : le groupe
-- (`dossier_learners`) s'il existe, sinon le titulaire seul. Ce repli est bon
-- pour les dossiers antérieurs au groupe, mais il rend un groupe VIDE
-- indiscernable d'un groupe pas encore rempli : le titulaire redevient
-- stagiaire par défaut, sur les émargements comme dans les effectifs.
--
-- Une colonne tranche, là où on ne pouvait que deviner. `true` par défaut :
-- c'est le comportement actuel et le cas de l'inscription individuelle.

ALTER TABLE app.dossiers
  ADD COLUMN IF NOT EXISTS holder_is_learner BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN app.dossiers.holder_is_learner IS
  'Le titulaire (learner_id) suit-il la formation ? false = commanditaire et référent seulement, il ne compte pas parmi les stagiaires.';

-- La dérivation des apprenants respecte le drapeau. Le repli sur le titulaire
-- ne vaut plus que pour un titulaire qui suit effectivement la formation.
CREATE OR REPLACE FUNCTION app.dossier_apprenants(p_dossier_id UUID)
RETURNS TABLE(learner_id UUID)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = app, public
AS $$
  SELECT dl.learner_id
    FROM app.dossier_learners dl
   WHERE dl.dossier_id = p_dossier_id
  UNION
  SELECT d.learner_id
    FROM app.dossiers d
   WHERE d.id = p_dossier_id
     AND d.learner_id IS NOT NULL
     AND d.holder_is_learner
     AND NOT EXISTS (SELECT 1 FROM app.dossier_learners dl2 WHERE dl2.dossier_id = p_dossier_id)
$$;

COMMENT ON FUNCTION app.dossier_apprenants(UUID) IS
  'Apprenants d''un dossier : le groupe (app.dossier_learners, 0175), plus le titulaire quand il suit lui-même la formation (holder_is_learner, 0191). Source unique de la dérivation des participants et des signataires attendus.';
