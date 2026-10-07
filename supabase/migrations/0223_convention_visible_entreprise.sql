-- La convention va dans l'espace entreprise (demande d'Ismael le 2026-10-07 :
-- « la convention doit aussi être déposée dans l'espace entreprise »).
--
-- Elle naît par quatre chemins (dossier, séance, proposition acceptée, PDF à
-- la demande) : un déclencheur la rend visible au référent quel que soit le
-- chemin. On peut toujours la repasser en interne ensuite. L'espace apprenant
-- l'exclut déjà pour une entreprise (0213) : elle ne va qu'au référent.

CREATE OR REPLACE FUNCTION app.tg_convention_visible_entreprise()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = app, pg_temp
AS $$
BEGIN
  IF NEW.kind = 'convention' THEN
    NEW.visible_entreprise := true;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tg_convention_visible_entreprise ON app.documents;
CREATE TRIGGER tg_convention_visible_entreprise
  BEFORE INSERT ON app.documents
  FOR EACH ROW EXECUTE FUNCTION app.tg_convention_visible_entreprise();

-- Les conventions déjà faites : une seule par dossier, pour ne pas montrer au
-- client les doublons encore présents — la signée d'abord, sinon la plus
-- récente ; jamais une ligne sans document.
WITH choisie AS (
  SELECT DISTINCT ON (doc.dossier_id) doc.id
  FROM app.documents doc
  WHERE doc.kind = 'convention'
    AND doc.dossier_id IS NOT NULL
    AND doc.deleted_at IS NULL
    AND doc.is_current
    -- Une convention sans fichier ni contenu n'a rien à montrer.
    AND (doc.storage_path IS NOT NULL OR doc.content_html IS NOT NULL)
    -- Le référent en voit déjà une : on n'en ajoute pas une deuxième.
    AND NOT EXISTS (
      SELECT 1 FROM app.documents v
      WHERE v.dossier_id = doc.dossier_id AND v.kind = 'convention'
        AND v.visible_entreprise AND v.is_current AND v.deleted_at IS NULL
        AND (v.storage_path IS NOT NULL OR v.content_html IS NOT NULL)
    )
  ORDER BY doc.dossier_id,
           EXISTS (SELECT 1 FROM app.document_signatures s WHERE s.document_id = doc.id AND s.status = 'signed') DESC,
           doc.created_at DESC
)
UPDATE app.documents d
   SET visible_entreprise = true
  FROM choisie
 WHERE d.id = choisie.id
   AND NOT d.visible_entreprise;
