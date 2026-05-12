-- ============================================================================
-- 0039 — Fix faille cross-tenant sur le bucket `documents`
-- ============================================================================
-- Avant : USING (bucket_id = 'documents') — tout authentifié de toute org
--         pouvait lire les PDF (conventions, attestations, émargements signés)
--         de tous les tenants. Faille RGPD majeure.
--
-- Path canonique du bucket : ${organization_id}/${kind}/${id}.pdf
-- cf. apps/web/app/(dashboard)/dossiers/[id]/emargements/[sessionId]/actions.ts:211
-- ============================================================================

DROP POLICY IF EXISTS "documents_member_read" ON storage.objects;

CREATE POLICY "documents_member_read"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'documents'
    AND (storage.foldername(name))[1]::uuid = app.current_organization_id()
  );

-- Note : pas de policy INSERT/UPDATE/DELETE pour `authenticated` — les PDF
-- sont générés exclusivement côté serveur via service_role (Server Actions
-- + Edge Functions). Une policy authenticated INSERT exposerait à des uploads
-- arbitraires (override de conventions, etc.).

COMMENT ON POLICY "documents_member_read" ON storage.objects IS
  'Bucket documents : lecture limitée aux membres de l''organisation propriétaire (path[1]=org_id). Écriture via service_role uniquement.';
