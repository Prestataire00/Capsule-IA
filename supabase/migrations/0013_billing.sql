-- ============================================================================
-- 0013 — Billing (invoices, lines, payments)
-- ============================================================================

CREATE TABLE app.invoices (
  id UUID PRIMARY KEY DEFAULT uuidv7(),
  organization_id UUID NOT NULL REFERENCES app.organizations(id) ON DELETE RESTRICT,
  reference TEXT NOT NULL,
  dossier_id UUID REFERENCES app.dossiers(id) ON DELETE RESTRICT,
  funder_id UUID REFERENCES app.funders(id) ON DELETE SET NULL,
  company_id UUID REFERENCES app.companies(id) ON DELETE SET NULL,
  status app.invoice_status NOT NULL DEFAULT 'draft',
  issued_at DATE,
  due_at DATE,
  paid_at TIMESTAMPTZ,
  subtotal_cents BIGINT NOT NULL DEFAULT 0,
  vat_cents BIGINT NOT NULL DEFAULT 0,
  total_cents BIGINT NOT NULL DEFAULT 0,
  currency CHAR(3) NOT NULL DEFAULT 'EUR',
  payment_terms TEXT,
  document_id UUID REFERENCES app.documents(id) ON DELETE SET NULL,
  external_id TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ NULL,
  UNIQUE (organization_id, reference)
);

CREATE TABLE app.invoice_lines (
  id UUID PRIMARY KEY DEFAULT uuidv7(),
  organization_id UUID NOT NULL REFERENCES app.organizations(id) ON DELETE CASCADE,
  invoice_id UUID NOT NULL REFERENCES app.invoices(id) ON DELETE CASCADE,
  position INT NOT NULL CHECK (position >= 0),
  description TEXT NOT NULL,
  quantity NUMERIC(10,2) NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit_amount_cents BIGINT NOT NULL CHECK (unit_amount_cents >= 0),
  vat_rate NUMERIC(5,2) NOT NULL DEFAULT 0,
  total_cents BIGINT GENERATED ALWAYS AS
    (ROUND(quantity * unit_amount_cents)::BIGINT) STORED,
  UNIQUE (invoice_id, position)
);

CREATE TABLE app.payments (
  id UUID PRIMARY KEY DEFAULT uuidv7(),
  organization_id UUID NOT NULL REFERENCES app.organizations(id) ON DELETE CASCADE,
  invoice_id UUID NOT NULL REFERENCES app.invoices(id) ON DELETE RESTRICT,
  amount_cents BIGINT NOT NULL CHECK (amount_cents > 0),
  paid_at TIMESTAMPTZ NOT NULL,
  method TEXT NOT NULL CHECK (method IN ('virement', 'cheque', 'cb', 'stripe', 'autre')),
  reference TEXT,
  external_id TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ix_invoices_org_status ON app.invoices(organization_id, status)
  WHERE deleted_at IS NULL;
CREATE INDEX ix_invoices_org_due ON app.invoices(organization_id, due_at)
  WHERE deleted_at IS NULL AND status NOT IN ('paid', 'cancelled');
CREATE INDEX ix_invoice_lines_invoice ON app.invoice_lines(invoice_id);
CREATE INDEX ix_payments_invoice ON app.payments(invoice_id);
