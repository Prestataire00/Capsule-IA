-- ============================================================================
-- 0169 — L'espace apprenant ne montre plus la convention de l'entreprise
-- ============================================================================
-- La convention groupée d'une entreprise est rattachée au dossier « socle »,
-- celui du premier salarié. `get_apprenant_resources` listant TOUS les
-- documents du dossier actif, ce salarié-là voyait dans son espace le document
-- qui nomme ses collègues (noms, e-mails, dates de naissance) et porte le
-- montant global de la commande. Les autres ne voyaient rien.
--
-- Depuis le 2026-09-14, chaque stagiaire a son propre exemplaire nominatif
-- (`metadata->>'audience' = 'stagiaire'`) ; l'exemplaire de l'entreprise reste
-- dans la GED côté organisme, pour transmission à son responsable.
--
-- On en profite pour ne remonter que la version courante : depuis 0158 un
-- document régénéré conserve ses versions précédentes, qui apparaissaient
-- toutes dans l'espace.

CREATE OR REPLACE FUNCTION app.get_apprenant_resources(p_learner_id UUID)
RETURNS JSONB
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = app, public
AS $$
  WITH dossier_actif AS (
    SELECT d.id, d.organization_id
    FROM app.dossiers d
    WHERE d.learner_id = p_learner_id
    ORDER BY d.start_date DESC
    LIMIT 1
  )
  SELECT jsonb_build_object(
    'dossier_id', (SELECT id FROM dossier_actif),

    -- ── Documents administratifs ─────────────────────────────────────────
    'documents', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id',              doc.id,
          'kind',            doc.kind,
          'title',           doc.title,
          'display_status',  CASE
            WHEN EXISTS (
              SELECT 1
              FROM app.document_signatures sig
              WHERE sig.document_id = doc.id
                AND sig.status = 'signed'
            ) THEN 'signed'
            WHEN doc.status = 'ready' THEN 'available'
            ELSE 'pending'
          END,
          'generated_at',    doc.generated_at,
          'file_size_bytes', doc.file_size_bytes
        )
        ORDER BY doc.created_at
      )
      FROM app.documents doc
      CROSS JOIN dossier_actif da
      WHERE doc.dossier_id = da.id
        AND doc.deleted_at IS NULL
        AND doc.is_current
        -- Pièce du client, pas du stagiaire : elle nomme ses collègues.
        AND COALESCE(doc.metadata ->> 'audience', '') <> 'entreprise'
        AND COALESCE(doc.metadata ->> 'grouped', '') NOT IN ('true', 't')
    ), '[]'::jsonb),

    -- ── Supports pédagogiques par module ─────────────────────────────────
    'supports', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'module_id',       dm.module_id,
          'module_title',    dm.title_snapshot,
          'module_position', dm.position,
          'resources',       COALESCE((
            SELECT jsonb_agg(
              jsonb_build_object(
                'id',              mr.id,
                'title',           mr.title,
                'mime_type',       mr.mime_type,
                'file_size_bytes', mr.file_size_bytes
              )
              ORDER BY mr.position
            )
            FROM app.module_resources mr
            WHERE mr.module_id = dm.module_id
              AND mr.is_published = true
              AND mr.deleted_at IS NULL
          ), '[]'::jsonb)
        )
        ORDER BY dm.position
      )
      FROM app.dossier_modules dm
      CROSS JOIN dossier_actif da
      WHERE dm.dossier_id = da.id
    ), '[]'::jsonb),

    -- ── Synthèse d'assiduité ─────────────────────────────────────────────
    'assiduite', (
      SELECT jsonb_build_object(
        'heures_planifiees', COALESCE(
          SUM(EXTRACT(EPOCH FROM (s.ends_at - s.starts_at)) / 3600.0),
          0
        ),
        'heures_signees', COALESCE(
          SUM(
            CASE WHEN EXISTS (
              SELECT 1
              FROM app.attendance_sheets ash
              JOIN app.attendance_signatures sig
                ON sig.attendance_sheet_id = ash.id
              WHERE ash.session_id    = s.id
                AND sig.learner_id    = p_learner_id
                AND sig.signed_at     IS NOT NULL
            ) THEN EXTRACT(EPOCH FROM (s.ends_at - s.starts_at)) / 3600.0
            ELSE 0
            END
          ),
          0
        )
      )
      FROM app.sessions s
      CROSS JOIN dossier_actif da
      WHERE s.dossier_id = da.id
        AND s.status <> 'cancelled'
    )
  );
$$;

-- `CREATE OR REPLACE` conserve les droits existants ; on les réaffirme quand
-- même, pour que la fermeture faite en 0136 ne dépende pas de ce détail.
REVOKE ALL ON FUNCTION app.get_apprenant_resources(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION app.get_apprenant_resources(UUID) TO service_role;

NOTIFY pgrst, 'reload schema';
