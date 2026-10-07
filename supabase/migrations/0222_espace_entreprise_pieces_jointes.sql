-- Des documents dans les échanges de l'espace entreprise (demande d'Ismael le
-- 2026-10-07 : « je dois également pouvoir déposer des documents dans la
-- conversation »). Des deux côtés : le référent et l'équipe.
--
-- `pieces` : [{ path, nom, mime, taille }]. Les fichiers vivent dans le bucket
-- privé `documents`, sous `echanges/<organisme>/<contact>/` ; ils ne se lisent
-- que par une URL signée, délivrée après contrôle du fil (lien du référent, ou
-- membre de l'équipe qui voit ce fil).
--
-- Un message peut n'être qu'un document : le texte devient facultatif dès
-- qu'une pièce est jointe.

ALTER TABLE app.espace_entreprise_messages
  ADD COLUMN IF NOT EXISTS pieces JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE app.espace_entreprise_messages
  DROP CONSTRAINT IF EXISTS espace_entreprise_messages_body_check;

ALTER TABLE app.espace_entreprise_messages
  DROP CONSTRAINT IF EXISTS espace_entreprise_messages_contenu;
ALTER TABLE app.espace_entreprise_messages
  ADD CONSTRAINT espace_entreprise_messages_contenu CHECK (
    jsonb_typeof(pieces) = 'array'
    AND char_length(btrim(body)) <= 4000
    AND (char_length(btrim(body)) >= 1 OR jsonb_array_length(pieces) > 0)
  );
