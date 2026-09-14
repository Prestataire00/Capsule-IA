-- Le détail d'une tâche devient du texte riche : police, gras, souligné,
-- surlignage, tableaux. L'éditeur produit du HTML, nettoyé côté serveur avant
-- enregistrement (features/tasks/rich-description.ts).
--
-- La limite de 4 000 caractères de 0159 était pensée pour du texte brut : un
-- seul tableau de quelques lignes la dépasse déjà en balises. On la relève à
-- 50 000, en phase avec le schéma Zod `createTaskSchema`.

ALTER TABLE app.tasks DROP CONSTRAINT IF EXISTS tasks_description_check;
ALTER TABLE app.tasks
  ADD CONSTRAINT tasks_description_check
  CHECK (description IS NULL OR length(description) <= 50000);

COMMENT ON COLUMN app.tasks.description IS
  'Détail de la tâche en HTML nettoyé (texte brut pour les tâches antérieures à 0160).';
