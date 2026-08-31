-- 0133 — Cloisonne par organisme la lecture de quatre seaux de stockage.
--
-- Constat (audit 2026-08-31, CAP-20) : quatre policies de lecture n'avaient pour
-- seule condition que « le seau est bien celui-ci ». Aucune borne d'organisation,
-- aucune borne d'utilisateur :
--
--     USING (bucket_id = 'signatures')
--
-- Tout compte authentifié — donc un membre de n'importe quel autre organisme de
-- la plateforme — pouvait non seulement télécharger ces objets, mais aussi les
-- **lister** : `storage.list()` s'appuie sur ce même SELECT. Il n'y avait donc
-- même pas d'identifiant à deviner.
--
--   signatures         images de signature manuscrite des apprenants et formateurs
--   prospect-documents pièces jointes des prospects (identité, justificatifs)
--   pedagogical        supports de cours — le fonds de commerce de l'organisme
--   zoom_imports       CSV de présence Zoom, avec noms et adresses des participants
--
-- Le premier est le plus grave : une signature manuscrite est réutilisable, et
-- son exposition affaiblit la valeur probante de l'émargement.
--
-- Chaque chemin d'objet commence par un identifiant qui permet de remonter à
-- l'organisation ; les policies s'appuient dessus, comme le fait déjà
-- `pedagogical_staff_insert` (migration 0077).

-- ── signatures : {attendance_sheet_id}/{kind}/{signer_id}.png ───────────────
DROP POLICY IF EXISTS "signatures_member_read" ON storage.objects;
CREATE POLICY "signatures_member_read"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'signatures'
    AND EXISTS (
      SELECT 1 FROM app.attendance_sheets s
      WHERE s.id::text = (storage.foldername(name))[1]
        AND s.organization_id = app.current_organization_id()
    )
  );

-- ── zoom_imports : {attendance_sheet_id}/{horodatage}-{fichier}.csv ─────────
DROP POLICY IF EXISTS "zoom_imports_member_read" ON storage.objects;
CREATE POLICY "zoom_imports_member_read"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'zoom_imports'
    AND EXISTS (
      SELECT 1 FROM app.attendance_sheets s
      WHERE s.id::text = (storage.foldername(name))[1]
        AND s.organization_id = app.current_organization_id()
    )
  );

-- ── prospect-documents : {prospect_id}/{clé}.{ext} ──────────────────────────
DROP POLICY IF EXISTS "prospect_docs_member_read" ON storage.objects;
CREATE POLICY "prospect_docs_member_read"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'prospect-documents'
    AND EXISTS (
      SELECT 1 FROM app.prospects p
      WHERE p.id::text = (storage.foldername(name))[1]
        AND p.organization_id = app.current_organization_id()
    )
  );

-- ── pedagogical : {organization_id}/{module_id}/{fichier} ───────────────────
-- L'organisation est déjà le premier segment du chemin : même idiome que la
-- policy d'écriture posée en 0077.
DROP POLICY IF EXISTS "pedagogical_member_read" ON storage.objects;
CREATE POLICY "pedagogical_member_read"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'pedagogical'
    AND (storage.foldername(name))[1] = app.current_organization_id()::text
  );
