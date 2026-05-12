-- ============================================================================
-- 0038 — Bucket Storage privé pour les PDF de documents générés
-- ============================================================================
-- Utilisé par la finalisation d'émargements (PDF Qualiopi) et autres documents
-- générés (conventions, attestations, certificats).

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'documents',
  'documents',
  false,
  20971520, -- 20 MB
  ARRAY['application/pdf']
)
ON CONFLICT (id) DO NOTHING;

-- Lecture par les membres authentifiés (audit Qualiopi)
CREATE POLICY "documents_member_read"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'documents');
