-- supabase/migrations/0037_buckets_trainer_self.sql
-- ============================================================================
-- 0037 — Buckets Storage pour l'espace formateur self
-- ============================================================================
-- Bucket `avatars` (public-read, owner-write) : path = ${user_id}/avatar.{ext}
-- Bucket `trainer-cvs` (privé, self-read/write) : path = ${organization_id}/${trainer_id}/${competency_id}.{ext}
-- ============================================================================

-- ── Bucket avatars (public-read, owner-write) ───────────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'avatars',
  'avatars',
  true, -- public-read
  5 * 1024 * 1024, -- 5 MB
  ARRAY['image/png', 'image/jpeg', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- Path = ${user_id}/avatar.{ext} — write par owner uniquement
CREATE POLICY "avatars_owner_write"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "avatars_owner_update"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "avatars_owner_delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
-- READ public via bucket.public = true (pas de policy SELECT nécessaire)

-- ── Bucket trainer-cvs (privé) ──────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'trainer-cvs',
  'trainer-cvs',
  false,
  10 * 1024 * 1024, -- 10 MB
  ARRAY['application/pdf', 'image/png', 'image/jpeg']
)
ON CONFLICT (id) DO NOTHING;

-- Path = ${organization_id}/${trainer_id}/${competency_id}.{ext}
-- Read : self (path[2] = trainer_id ∈ mes trainers)
-- (Lecture admin OF via service_role uniquement en V1 — policies admin storage TBD sous-projet 3 si besoin)

CREATE POLICY "trainer_cvs_self_read"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'trainer-cvs'
    AND (storage.foldername(name))[2]::uuid IN (
      SELECT id FROM app.trainers WHERE user_id = auth.uid() AND deleted_at IS NULL
    )
  );

CREATE POLICY "trainer_cvs_self_write"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'trainer-cvs'
    AND (storage.foldername(name))[2]::uuid IN (
      SELECT id FROM app.trainers WHERE user_id = auth.uid() AND deleted_at IS NULL
    )
  );

CREATE POLICY "trainer_cvs_self_delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'trainer-cvs'
    AND (storage.foldername(name))[2]::uuid IN (
      SELECT id FROM app.trainers WHERE user_id = auth.uid() AND deleted_at IS NULL
    )
  );
