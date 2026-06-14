-- ============================================================================
-- 0043 — Vue read model : émargement consolidé (par feuille)
-- ============================================================================
-- Un row par attendance_sheet, enrichi pour l'agrégation par session /
-- entreprise / formateur. SECURITY INVOKER => RLS des tables de base appliquée
-- (isolation organisation gratuite). Lecture seule.
-- ============================================================================

CREATE VIEW app.attendance_consolidated
WITH (security_invoker = true) AS
SELECT
  sh.id                              AS attendance_sheet_id,
  sh.organization_id                 AS organization_id,
  sh.dossier_id                      AS dossier_id,
  sh.session_id                      AS session_id,
  sh.status                          AS status,
  d.company_id                       AS company_id,
  c.name                             AS company_name,
  tp.trainer_id                      AS trainer_id,
  (t.first_name || ' ' || t.last_name) AS trainer_name,
  s.starts_at                        AS session_starts_at,
  s.ends_at                          AS session_ends_at,
  s.duration_hours                   AS session_hours,
  s.modality::text                   AS modality,
  -- Apprenants attendus pour la session
  (SELECT count(*) FROM app.session_participants sp
     WHERE sp.session_id = sh.session_id
       AND sp.participant_kind = 'learner')          AS expected_count,
  -- Signatures apprenant enregistrées
  (SELECT count(*) FROM app.attendance_signatures sig
     WHERE sig.attendance_sheet_id = sh.id
       AND sig.participant_kind = 'learner')         AS signed_count,
  -- Dont preuve Zoom
  (SELECT count(*) FROM app.attendance_signatures sig
     WHERE sig.attendance_sheet_id = sh.id
       AND sig.participant_kind = 'learner'
       AND sig.evidence_source IN ('zoom_api','zoom_csv')) AS zoom_count,
  -- Dont preuve manuelle/humaine
  (SELECT count(*) FROM app.attendance_signatures sig
     WHERE sig.attendance_sheet_id = sh.id
       AND sig.participant_kind = 'learner'
       AND sig.evidence_source IN ('manual','qr','trainer_override')) AS manual_count,
  -- Dernier statut de sync Zoom pour la session
  (SELECT zl.status FROM app.zoom_sync_logs zl
     WHERE zl.session_id = sh.session_id
     ORDER BY zl.fetched_at DESC
     LIMIT 1)                                        AS zoom_last_sync_status
FROM app.attendance_sheets sh
JOIN app.sessions s        ON s.id = sh.session_id
JOIN app.dossiers d        ON d.id = sh.dossier_id
LEFT JOIN app.companies c  ON c.id = d.company_id
-- Un seul formateur par feuille (le premier participant trainer)
LEFT JOIN LATERAL (
  SELECT sp.trainer_id
    FROM app.session_participants sp
   WHERE sp.session_id = sh.session_id
     AND sp.participant_kind = 'trainer'
   ORDER BY sp.trainer_id
   LIMIT 1
) tp ON true
LEFT JOIN app.trainers t   ON t.id = tp.trainer_id;

GRANT SELECT ON app.attendance_consolidated TO authenticated;

COMMENT ON VIEW app.attendance_consolidated IS
  'Read model émargement (un row/feuille) pour le dashboard consolidé. SECURITY INVOKER.';
