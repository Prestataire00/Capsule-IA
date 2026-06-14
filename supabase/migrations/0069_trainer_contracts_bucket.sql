-- ============================================================================
-- 0069 — Bucket privé pour les contrats de sous-traitance des formateurs
-- ============================================================================
-- La colonne app.trainers.contract_path existe depuis 0064. Ici on crée le
-- stockage : un bucket privé dont le 1er segment du path = organization_id.
-- Lecture réservée aux membres de l'organisation, écriture réservée admin/owner
-- (le contrat est géré par l'OF, pas par le formateur lui-même → on ne réutilise
-- pas le bucket self-only `trainer-cvs`).
-- Path convention : ${organization_id}/${trainer_id}/contract.${ext}

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'trainer-contracts', 'trainer-contracts', false,
  10485760, -- 10 MB
  ARRAY['application/pdf']
)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "trainer_contracts_member_read"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'trainer-contracts'
    AND (storage.foldername(name))[1] = app.current_organization_id()::text
  );

CREATE POLICY "trainer_contracts_admin_insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'trainer-contracts'
    AND (storage.foldername(name))[1] = app.current_organization_id()::text
    AND app.is_admin_or_owner()
  );

CREATE POLICY "trainer_contracts_admin_update"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'trainer-contracts'
    AND (storage.foldername(name))[1] = app.current_organization_id()::text
    AND app.is_admin_or_owner()
  );

CREATE POLICY "trainer_contracts_admin_delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'trainer-contracts'
    AND (storage.foldername(name))[1] = app.current_organization_id()::text
    AND app.is_admin_or_owner()
  );
