-- ============================================================================
-- 0123 — Re-home idempotent : colonne app.trainers.photo_path (+ bucket/policies)
-- ============================================================================
-- La migration 0115_trainer_photo n'a jamais exécuté son DDL en prod : le slot de
-- version 0115 avait été consommé par 0115_fix_dossier_transition_guard (doublon
-- de version historique), donc `supabase db push` a considéré 0115 « appliqué » et
-- a sauté le trainer_photo → la colonne app.trainers.photo_path n'existe pas en
-- prod (erreur 42703 sur la page Formateurs). Cette migration redevient la source
-- de vérité : entièrement idempotente (no-op si déjà présent).

ALTER TABLE app.trainers ADD COLUMN IF NOT EXISTS photo_path TEXT;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'trainer-photos', 'trainer-photos', true,
  2097152, -- 2 MB
  ARRAY['image/png', 'image/jpeg', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

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

-- Rafraîchit le cache de schéma PostgREST (colonne trainers.photo_path).
NOTIFY pgrst, 'reload schema';
