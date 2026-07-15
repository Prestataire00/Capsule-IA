-- ============================================================================
-- 0110 — Photo de profil du formateur (affichée au catalogue)
-- ============================================================================
-- La description existe déjà (app.trainers.bio). On ajoute une photo, stockée
-- dans un bucket PUBLIC (les photos de formateurs apparaissent au catalogue).
-- Écriture réservée aux admin/owner de l'organisation (path = org_id/...).

ALTER TABLE app.trainers ADD COLUMN IF NOT EXISTS photo_path TEXT;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'trainer-photos', 'trainer-photos', true,
  2097152, -- 2 MB
  ARRAY['image/png', 'image/jpeg', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- Bucket public : lecture via l'URL publique (pas de policy SELECT nécessaire).
-- Écriture / mise à jour / suppression : admin ou owner de l'org propriétaire du path.
DROP POLICY IF EXISTS "trainer_photos_admin_insert" ON storage.objects;
CREATE POLICY "trainer_photos_admin_insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'trainer-photos'
    AND (storage.foldername(name))[1] = app.current_organization_id()::text
    AND app.is_admin_or_owner()
  );

DROP POLICY IF EXISTS "trainer_photos_admin_update" ON storage.objects;
CREATE POLICY "trainer_photos_admin_update"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'trainer-photos'
    AND (storage.foldername(name))[1] = app.current_organization_id()::text
    AND app.is_admin_or_owner()
  );

DROP POLICY IF EXISTS "trainer_photos_admin_delete" ON storage.objects;
CREATE POLICY "trainer_photos_admin_delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'trainer-photos'
    AND (storage.foldername(name))[1] = app.current_organization_id()::text
    AND app.is_admin_or_owner()
  );

-- Rafraîchit le cache de schéma PostgREST (nouvelle colonne trainers.photo_path).
NOTIFY pgrst, 'reload schema';
