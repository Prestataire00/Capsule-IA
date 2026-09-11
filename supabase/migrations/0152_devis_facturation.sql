-- ============================================================================
-- 0152 — Devis structurés & facturation « façon RFC »
--
-- Un devis par CLIENT : une entreprise (tous ses stagiaires d'une même
-- session regroupés) ou un particulier. Généré automatiquement dès que le
-- dossier a une session et une analyse du besoin, relu/modifié par l'organisme,
-- puis envoyé en signature. Sa signature crée la facture brouillon.
--
-- Le rendu HTML reste un `documents` (kind 'devis') : aperçu, signature
-- électronique et frise d'avancement le lisent déjà.
-- ============================================================================

-- Tarif de la session (HT, par stagiaire). NULL = tarif catalogue de la formation.
ALTER TABLE app.sessions
  ADD COLUMN IF NOT EXISTS price_cents BIGINT CHECK (price_cents IS NULL OR price_cents >= 0);

COMMENT ON COLUMN app.sessions.price_cents IS
  'Tarif HT par stagiaire de la session ; à défaut, formations.default_price_cents. Prix unitaire par défaut du devis.';

-- ── Numérotation continue DEV-AAAA-NNN / FAC-AAAA-NNN ────────────────────────
CREATE TABLE IF NOT EXISTS app.document_counters (
  organization_id UUID NOT NULL REFERENCES app.organizations(id) ON DELETE CASCADE,
  prefix TEXT NOT NULL CHECK (prefix IN ('DEV', 'FAC')),
  year INT NOT NULL,
  last_value INT NOT NULL DEFAULT 0 CHECK (last_value >= 0),
  PRIMARY KEY (organization_id, prefix, year)
);

-- ── Devis ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS app.quotes (
  id UUID PRIMARY KEY DEFAULT uuidv7(),
  organization_id UUID NOT NULL REFERENCES app.organizations(id) ON DELETE RESTRICT,
  reference TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'sent', 'signed', 'refused', 'expired', 'cancelled')),
  client_kind TEXT NOT NULL CHECK (client_kind IN ('company', 'individual')),
  company_id UUID REFERENCES app.companies(id) ON DELETE SET NULL,
  learner_id UUID REFERENCES app.learners(id) ON DELETE SET NULL,
  formation_id UUID REFERENCES app.formations(id) ON DELETE SET NULL,
  session_id UUID REFERENCES app.sessions(id) ON DELETE SET NULL,
  recipient_name TEXT,
  recipient_email TEXT,
  object TEXT NOT NULL,
  notes TEXT,
  issued_on DATE NOT NULL DEFAULT CURRENT_DATE,
  valid_until DATE NOT NULL,
  vat_rate NUMERIC(5, 2) NOT NULL DEFAULT 0 CHECK (vat_rate >= 0 AND vat_rate <= 100),
  subtotal_cents BIGINT NOT NULL DEFAULT 0,
  vat_cents BIGINT NOT NULL DEFAULT 0,
  total_cents BIGINT NOT NULL DEFAULT 0,
  currency CHAR(3) NOT NULL DEFAULT 'EUR',
  document_id UUID REFERENCES app.documents(id) ON DELETE SET NULL,
  auto_generated BOOLEAN NOT NULL DEFAULT false,
  sent_at TIMESTAMPTZ,
  signed_at TIMESTAMPTZ,
  refused_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ NULL,
  UNIQUE (organization_id, reference)
);

CREATE TABLE IF NOT EXISTS app.quote_lines (
  id UUID PRIMARY KEY DEFAULT uuidv7(),
  organization_id UUID NOT NULL REFERENCES app.organizations(id) ON DELETE CASCADE,
  quote_id UUID NOT NULL REFERENCES app.quotes(id) ON DELETE CASCADE,
  position INT NOT NULL CHECK (position >= 0),
  description TEXT NOT NULL,
  details TEXT,
  quantity NUMERIC(10, 2) NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit_amount_cents BIGINT NOT NULL CHECK (unit_amount_cents >= 0),
  -- NULL = taux du devis.
  vat_rate NUMERIC(5, 2) CHECK (vat_rate IS NULL OR (vat_rate >= 0 AND vat_rate <= 100)),
  total_cents BIGINT GENERATED ALWAYS AS (ROUND(quantity * unit_amount_cents)::BIGINT) STORED,
  UNIQUE (quote_id, position)
);

-- Dossiers (donc stagiaires) couverts par le devis.
CREATE TABLE IF NOT EXISTS app.quote_dossiers (
  quote_id UUID NOT NULL REFERENCES app.quotes(id) ON DELETE CASCADE,
  dossier_id UUID NOT NULL REFERENCES app.dossiers(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES app.organizations(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (quote_id, dossier_id)
);

DROP TRIGGER IF EXISTS tg_quotes_updated_at ON app.quotes;
CREATE TRIGGER tg_quotes_updated_at BEFORE UPDATE ON app.quotes
FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

CREATE INDEX IF NOT EXISTS ix_quotes_org_status ON app.quotes(organization_id, status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS ix_quotes_company ON app.quotes(company_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS ix_quotes_session ON app.quotes(session_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS ix_quotes_document ON app.quotes(document_id);
CREATE INDEX IF NOT EXISTS ix_quote_lines_quote ON app.quote_lines(quote_id);
CREATE INDEX IF NOT EXISTS ix_quote_dossiers_dossier ON app.quote_dossiers(dossier_id);

-- Facture issue d'un devis.
ALTER TABLE app.invoices
  ADD COLUMN IF NOT EXISTS quote_id UUID REFERENCES app.quotes(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS ix_invoices_quote ON app.invoices(quote_id) WHERE deleted_at IS NULL;

-- Modes de règlement des organismes de formation (OPCO, CPF, espèces).
ALTER TABLE app.payments DROP CONSTRAINT IF EXISTS payments_method_check;
ALTER TABLE app.payments
  ADD CONSTRAINT payments_method_check
  CHECK (method IN ('virement', 'cheque', 'cb', 'stripe', 'especes', 'opco', 'cpf', 'autre'));

-- ── RPC de numérotation ──────────────────────────────────────────────────────
-- Compteur par (organisme, préfixe, année), incrémenté sous verrou de ligne :
-- deux devis simultanés ne peuvent pas prendre le même numéro, et la suite
-- repart au plus grand numéro déjà présent (reprise d'historique).
CREATE OR REPLACE FUNCTION app.next_document_number(p_org UUID, p_prefix TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, pg_temp
AS $$
DECLARE
  v_year INT := EXTRACT(YEAR FROM (now() AT TIME ZONE 'Europe/Paris'))::INT;
  v_base INT;
  v_next INT;
BEGIN
  IF p_prefix NOT IN ('DEV', 'FAC') THEN
    RAISE EXCEPTION 'préfixe de numérotation inconnu : %', p_prefix;
  END IF;

  IF COALESCE(current_setting('request.jwt.claims', true)::jsonb ->> 'role', '') <> 'service_role'
     AND (p_org IS DISTINCT FROM app.current_organization_id()
          OR NOT (app.is_staff() OR app.has_role('comptable'))) THEN
    RAISE EXCEPTION 'numérotation refusée' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(MAX((regexp_match(r.reference, '^' || p_prefix || '-' || v_year || '-(\d+)$'))[1]::INT), 0)
    INTO v_base
  FROM (
    SELECT reference FROM app.invoices WHERE organization_id = p_org AND p_prefix = 'FAC'
    UNION ALL
    SELECT reference FROM app.quotes WHERE organization_id = p_org AND p_prefix = 'DEV'
  ) r;

  INSERT INTO app.document_counters (organization_id, prefix, year, last_value)
  VALUES (p_org, p_prefix, v_year, v_base + 1)
  ON CONFLICT (organization_id, prefix, year)
  DO UPDATE SET last_value = GREATEST(app.document_counters.last_value, v_base) + 1
  RETURNING last_value INTO v_next;

  RETURN p_prefix || '-' || v_year || '-' || lpad(v_next::TEXT, 3, '0');
END;
$$;

REVOKE ALL ON FUNCTION app.next_document_number(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION app.next_document_number(UUID, TEXT) TO authenticated, service_role;

-- ── RLS ──────────────────────────────────────────────────────────────────────
ALTER TABLE app.document_counters ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.document_counters FORCE ROW LEVEL SECURITY;
ALTER TABLE app.quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.quotes FORCE ROW LEVEL SECURITY;
ALTER TABLE app.quote_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.quote_lines FORCE ROW LEVEL SECURITY;
ALTER TABLE app.quote_dossiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.quote_dossiers FORCE ROW LEVEL SECURITY;

-- Compteurs : lecture seule pour le staff, écriture uniquement via la RPC.
CREATE POLICY document_counters_select ON app.document_counters FOR SELECT
USING (organization_id = app.current_organization_id() AND (app.is_staff() OR app.has_role('comptable')));

CREATE POLICY quotes_select ON app.quotes FOR SELECT
USING (organization_id = app.current_organization_id() AND deleted_at IS NULL
       AND (app.is_staff() OR app.has_role('comptable')));
CREATE POLICY quotes_insert ON app.quotes FOR INSERT
WITH CHECK (organization_id = app.current_organization_id() AND (app.is_staff() OR app.has_role('comptable')));
CREATE POLICY quotes_update ON app.quotes FOR UPDATE
USING (organization_id = app.current_organization_id() AND (app.is_staff() OR app.has_role('comptable')))
WITH CHECK (organization_id = app.current_organization_id());
CREATE POLICY quotes_delete ON app.quotes FOR DELETE
USING (organization_id = app.current_organization_id() AND app.is_admin_or_owner() AND status = 'draft');

CREATE POLICY quote_lines_select ON app.quote_lines FOR SELECT
USING (organization_id = app.current_organization_id() AND (app.is_staff() OR app.has_role('comptable')));
CREATE POLICY quote_lines_insert ON app.quote_lines FOR INSERT
WITH CHECK (
  organization_id = app.current_organization_id() AND (app.is_staff() OR app.has_role('comptable'))
  AND EXISTS (SELECT 1 FROM app.quotes q
              WHERE q.id = quote_lines.quote_id AND q.organization_id = app.current_organization_id()
                AND q.status = 'draft')
);
CREATE POLICY quote_lines_update ON app.quote_lines FOR UPDATE
USING (
  organization_id = app.current_organization_id() AND (app.is_staff() OR app.has_role('comptable'))
  AND EXISTS (SELECT 1 FROM app.quotes q WHERE q.id = quote_lines.quote_id AND q.status = 'draft')
)
WITH CHECK (organization_id = app.current_organization_id());
CREATE POLICY quote_lines_delete ON app.quote_lines FOR DELETE
USING (
  organization_id = app.current_organization_id() AND (app.is_staff() OR app.has_role('comptable'))
  AND EXISTS (SELECT 1 FROM app.quotes q WHERE q.id = quote_lines.quote_id AND q.status = 'draft')
);

CREATE POLICY quote_dossiers_select ON app.quote_dossiers FOR SELECT
USING (organization_id = app.current_organization_id() AND (app.is_staff() OR app.has_role('comptable')));
CREATE POLICY quote_dossiers_insert ON app.quote_dossiers FOR INSERT
WITH CHECK (organization_id = app.current_organization_id() AND (app.is_staff() OR app.has_role('comptable')));
CREATE POLICY quote_dossiers_delete ON app.quote_dossiers FOR DELETE
USING (organization_id = app.current_organization_id() AND (app.is_staff() OR app.has_role('comptable')));

NOTIFY pgrst, 'reload schema';
