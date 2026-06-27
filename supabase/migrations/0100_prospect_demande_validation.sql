-- ============================================================================
-- 0100 — Validation des demandes + vérification des pièces justificatives
-- ============================================================================
-- Une demande (prospect) est « en attente de validation » jusqu'à ce qu'un
-- admin/gestionnaire vérifie les pièces et la valide. On ajoute :
--   - un axe de validation sur app.prospects (séparé du pipeline status) ;
--   - une table de revue par pièce (app.prospect_document_reviews) ;
--   - une timeline d'actions (app.prospect_events) ;
--   - une fonction de résolution des destinataires staff (notifications).
-- ============================================================================

-- 1. Axe de validation sur les prospects (additif, nullable/défaut sûr).
ALTER TABLE app.prospects
  ADD COLUMN IF NOT EXISTS validation_status TEXT NOT NULL DEFAULT 'pending_validation'
    CHECK (validation_status IN ('pending_validation', 'validated', 'rejected')),
  ADD COLUMN IF NOT EXISTS validated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS validated_by UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS validation_rejected_reason TEXT;

CREATE INDEX IF NOT EXISTS ix_prospects_validation
  ON app.prospects (organization_id, validation_status)
  WHERE deleted_at IS NULL;

-- Backfill : les prospects existants (antérieurs à la feature) sont considérés
-- validés pour ne pas inonder l'inbox « nouvelles demandes ».
UPDATE app.prospects SET validation_status = 'validated'
  WHERE validation_status = 'pending_validation';

-- 2. Revue par pièce justificative.
CREATE TABLE app.prospect_document_reviews (
  id UUID PRIMARY KEY DEFAULT uuidv7(),
  organization_id UUID NOT NULL REFERENCES app.organizations(id) ON DELETE CASCADE,
  prospect_id UUID NOT NULL REFERENCES app.prospects(id) ON DELETE CASCADE,
  doc_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'verified', 'rejected')),
  rejected_reason TEXT,
  reviewed_by UUID REFERENCES auth.users(id),
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (prospect_id, doc_key)
);
CREATE INDEX ix_pdr_prospect ON app.prospect_document_reviews (prospect_id);

ALTER TABLE app.prospect_document_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.prospect_document_reviews FORCE ROW LEVEL SECURITY;
CREATE POLICY pdr_select ON app.prospect_document_reviews FOR SELECT TO authenticated
  USING (organization_id = app.current_organization_id() AND app.is_staff());
CREATE POLICY pdr_insert ON app.prospect_document_reviews FOR INSERT TO authenticated
  WITH CHECK (organization_id = app.current_organization_id() AND app.is_staff());
CREATE POLICY pdr_update ON app.prospect_document_reviews FOR UPDATE TO authenticated
  USING (organization_id = app.current_organization_id() AND app.is_staff())
  WITH CHECK (organization_id = app.current_organization_id() AND app.is_staff());

-- 3. Timeline d'actions (append-only).
CREATE TABLE app.prospect_events (
  id UUID PRIMARY KEY DEFAULT uuidv7(),
  organization_id UUID NOT NULL REFERENCES app.organizations(id) ON DELETE CASCADE,
  prospect_id UUID NOT NULL REFERENCES app.prospects(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN (
    'document_verified', 'document_rejected',
    'demande_validated', 'demande_rejected', 'comment')),
  actor_user_id UUID REFERENCES auth.users(id),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ix_prospect_events_prospect ON app.prospect_events (prospect_id, occurred_at DESC);

ALTER TABLE app.prospect_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.prospect_events FORCE ROW LEVEL SECURITY;
CREATE POLICY pe_select ON app.prospect_events FOR SELECT TO authenticated
  USING (organization_id = app.current_organization_id() AND app.is_staff());
CREATE POLICY pe_insert ON app.prospect_events FOR INSERT TO authenticated
  WITH CHECK (organization_id = app.current_organization_id() AND app.is_staff());
-- Pas de policy UPDATE/DELETE : la timeline est append-only.

-- 4. Destinataires staff (owner/admin/gestionnaire) d'une org, avec email.
--    SECURITY DEFINER pour lire auth.users (réservé service_role à l'appel).
CREATE OR REPLACE FUNCTION app.staff_recipients(p_org UUID)
RETURNS TABLE (user_id UUID, email TEXT)
LANGUAGE sql
SECURITY DEFINER
SET search_path = app, auth, public
AS $$
  SELECT m.user_id, u.email::text
  FROM app.members m
  JOIN auth.users u ON u.id = m.user_id
  WHERE m.organization_id = p_org
    AND m.deleted_at IS NULL
    AND m.role IN ('owner', 'admin', 'gestionnaire')
    AND u.email IS NOT NULL;
$$;
REVOKE ALL ON FUNCTION app.staff_recipients(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.staff_recipients(UUID) TO service_role;
