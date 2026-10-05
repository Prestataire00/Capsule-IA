-- ============================================================================
-- 0206 — La validation des cours suit les rôles, plus de désignation
-- ============================================================================
-- Demande d'Ismael (2026-10-05) : rien à désigner. Les propriétaires et
-- administrateurs valident (l'un suffit), les gestionnaires sont en copie.
-- La table de désignation (0203) ne sert plus.
-- ============================================================================

DROP TABLE IF EXISTS app.course_validation_recipients;
