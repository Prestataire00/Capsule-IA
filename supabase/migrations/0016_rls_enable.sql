-- ============================================================================
-- 0016 — RLS ENABLE (deny-by-default partout)
-- Les policies sont ajoutées dans les migrations 0019+.
-- ============================================================================

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT schemaname, tablename
    FROM pg_tables
    WHERE schemaname IN ('app', 'audit', 'infra')
  LOOP
    EXECUTE format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY;',
      r.schemaname, r.tablename);
    EXECUTE format('ALTER TABLE %I.%I FORCE ROW LEVEL SECURITY;',
      r.schemaname, r.tablename);
  END LOOP;
END $$;
