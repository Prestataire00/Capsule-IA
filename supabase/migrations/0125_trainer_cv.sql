-- 0125 — CV du formateur
--
-- Le bucket `trainer-cvs` existe depuis 0037 mais n'était accessible qu'au
-- formateur lui-même (policies « self »), et aucune colonne ne pointait vers le
-- CV courant : l'organisme ne pouvait ni déposer ni relire le CV d'un formateur.
-- On ajoute la colonne + les policies staff, calquées sur `trainer-photos` (0123).
--
-- Le bucket reste PRIVÉ (un CV est une donnée personnelle) : la lecture passe
-- par une URL signée, jamais par une URL publique.

ALTER TABLE app.trainers ADD COLUMN IF NOT EXISTS cv_path TEXT;

COMMENT ON COLUMN app.trainers.cv_path IS
  'Chemin du CV dans le bucket privé trainer-cvs (${organization_id}/${trainer_id}/cv.{ext}).';

DROP POLICY IF EXISTS "trainer_cvs_admin_read" ON storage.objects;
CREATE POLICY "trainer_cvs_admin_read"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'trainer-cvs'
    AND (storage.foldername(name))[1] = app.current_organization_id()::text
    AND app.is_admin_or_owner()
  );

DROP POLICY IF EXISTS "trainer_cvs_admin_insert" ON storage.objects;
CREATE POLICY "trainer_cvs_admin_insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'trainer-cvs'
    AND (storage.foldername(name))[1] = app.current_organization_id()::text
    AND app.is_admin_or_owner()
  );

DROP POLICY IF EXISTS "trainer_cvs_admin_update" ON storage.objects;
CREATE POLICY "trainer_cvs_admin_update"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'trainer-cvs'
    AND (storage.foldername(name))[1] = app.current_organization_id()::text
    AND app.is_admin_or_owner()
  );

DROP POLICY IF EXISTS "trainer_cvs_admin_delete" ON storage.objects;
CREATE POLICY "trainer_cvs_admin_delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'trainer-cvs'
    AND (storage.foldername(name))[1] = app.current_organization_id()::text
    AND app.is_admin_or_owner()
  );

NOTIFY pgrst, 'reload schema';
