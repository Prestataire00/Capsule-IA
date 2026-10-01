-- Un nom de dossier choisi à la main.
--
-- Demande d'Ismael le 2026-10-01. Le nom affiché d'un dossier se déduisait
-- seul : le stagiaire titulaire, sinon le référent du client, sinon
-- l'entreprise. Pour une affaire d'entreprise, la fiche portait donc le nom
-- d'un salarié (« Rémy … ») alors qu'on la cherche par celui de la société.
--
-- NULL = nom déduit, comme avant : aucune reprise de l'existant. La politique
-- de mise à jour des dossiers couvre déjà la colonne.
ALTER TABLE app.dossiers
  ADD COLUMN IF NOT EXISTS nom TEXT
  CHECK (nom IS NULL OR char_length(btrim(nom)) BETWEEN 1 AND 120);

COMMENT ON COLUMN app.dossiers.nom IS
  'Nom donné au dossier. NULL = nom déduit (stagiaire, référent, entreprise).';

NOTIFY pgrst, 'reload schema';
