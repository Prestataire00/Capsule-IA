-- ============================================================================
-- 0045 — Signature/cachet de l'organisme + persistance documentaire
-- ============================================================================

-- 1) Représentant + assets signature sur l'organisation
ALTER TABLE app.organizations
  ADD COLUMN IF NOT EXISTS representative_name  TEXT,
  ADD COLUMN IF NOT EXISTS representative_title TEXT,
  ADD COLUMN IF NOT EXISTS signature_path       TEXT,
  ADD COLUMN IF NOT EXISTS stamp_path           TEXT;

-- 2) Bucket privé pour les images de signature/cachet (PNG)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'org_assets', 'org_assets', false,
  2097152, -- 2 MB
  ARRAY['image/png']
)
ON CONFLICT (id) DO NOTHING;

-- 3) RLS org_assets : un membre n'accède qu'aux objets de SON organisation
--    (1er segment du path = organization_id). Écriture réservée admin/owner.
CREATE POLICY "org_assets_member_read"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'org_assets'
    AND (storage.foldername(name))[1] = app.current_organization_id()::text
  );

CREATE POLICY "org_assets_admin_insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'org_assets'
    AND (storage.foldername(name))[1] = app.current_organization_id()::text
    AND app.is_admin_or_owner()
  );

CREATE POLICY "org_assets_admin_update"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'org_assets'
    AND (storage.foldername(name))[1] = app.current_organization_id()::text
    AND app.is_admin_or_owner()
  );

CREATE POLICY "org_assets_admin_delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'org_assets'
    AND (storage.foldername(name))[1] = app.current_organization_id()::text
    AND app.is_admin_or_owner()
  );

-- 4) Idempotence content-addressed des documents générés
CREATE UNIQUE INDEX IF NOT EXISTS ux_documents_org_filehash
  ON app.documents (organization_id, file_hash)
  WHERE file_hash IS NOT NULL AND deleted_at IS NULL;
