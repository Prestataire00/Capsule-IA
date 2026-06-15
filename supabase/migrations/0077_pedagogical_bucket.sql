-- ============================================================================
-- 0077 — Bucket Storage privé pour les supports pédagogiques
-- ============================================================================
-- Bucket privé "pedagogical" : PDF, présentations, tableurs, documents Word,
-- images. Limite 50 MB par fichier.
-- Calqué sur 0038_documents_bucket.sql (bucket "documents").

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'pedagogical',
  'pedagogical',
  false,
  52428800, -- 50 MB
  ARRAY[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'image/png',
    'image/jpeg'
  ]
)
ON CONFLICT (id) DO NOTHING;

-- Lecture par les membres authentifiés (même pattern que "documents_member_read")
CREATE POLICY "pedagogical_member_read"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'pedagogical');

-- Écriture réservée au staff de l'organisation (préfixe de chemin = organization_id).
CREATE POLICY "pedagogical_staff_insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'pedagogical'
    AND (storage.foldername(name))[1] = app.current_organization_id()::text
    AND app.is_staff()
  );

CREATE POLICY "pedagogical_staff_update"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'pedagogical'
    AND (storage.foldername(name))[1] = app.current_organization_id()::text
    AND app.is_staff()
  )
  WITH CHECK (
    bucket_id = 'pedagogical'
    AND (storage.foldername(name))[1] = app.current_organization_id()::text
    AND app.is_staff()
  );

CREATE POLICY "pedagogical_staff_delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'pedagogical'
    AND (storage.foldername(name))[1] = app.current_organization_id()::text
    AND app.is_staff()
  );
