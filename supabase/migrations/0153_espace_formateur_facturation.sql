-- 0153 — Espace formateur : tarif sur la fiche, factures d'honoraires, notes de frais
--
--  · Tarif du formateur saisi par l'organisme sur la fiche : montant et base
--    (heure, jour, séance). Le formateur le voit mais ne peut pas le changer.
--  · Profil de facturation PAR COMPTE formateur (numérotation continue de ses
--    factures, tous clients confondus) : identité, adresse, SIRET, TVA, banque.
--  · Factures d'honoraires : générées dans Capsule (calculées depuis les
--    séances terminées et le tarif) ou déposées en PDF ; l'organisme valide,
--    refuse, puis marque « payée ». Une séance n'est facturée qu'une fois.
--  · Notes de frais : justificatif obligatoire, rattachées à une séance ;
--    l'organisme valide, refuse, puis marque « remboursée ».
--  · Lecture : le formateur pour les siennes, l'organisme pour ses rôles
--    « facturation » (dirigeant, administrateur, gestionnaire, comptable).
--    Aucune écriture directe : actions et routes gardées, en service role.
--
-- Rejouable sans risque.

-- ── 1. Tarif sur la fiche ───────────────────────────────────────────────────
ALTER TABLE app.trainers
  ADD COLUMN IF NOT EXISTS tarif_base TEXT,
  ADD COLUMN IF NOT EXISTS tarif_cents BIGINT;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'trainers_tarif_check') THEN
    ALTER TABLE app.trainers ADD CONSTRAINT trainers_tarif_check CHECK (
      (tarif_base IS NULL OR tarif_base IN ('heure', 'jour', 'session'))
      AND (tarif_cents IS NULL OR tarif_cents >= 0));
  END IF;
END $$;

COMMENT ON COLUMN app.trainers.tarif_base IS 'Base de facturation du formateur : heure, jour ou séance (0153).';
COMMENT ON COLUMN app.trainers.tarif_cents IS 'Tarif du formateur par unité de la base, en centimes HT (0153).';

CREATE OR REPLACE FUNCTION app.trainers_self_edit_guard()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  -- Si l'updater est le trainer lui-même (user_id du row = auth.uid()),
  -- aucun champ admin-only ne doit changer — son tarif compris (0153).
  IF NEW.user_id = auth.uid() AND OLD.user_id = auth.uid() THEN
    IF NEW.email             IS DISTINCT FROM OLD.email             OR
       NEW.is_internal       IS DISTINCT FROM OLD.is_internal       OR
       NEW.hourly_rate_cents IS DISTINCT FROM OLD.hourly_rate_cents OR
       NEW.tarif_base        IS DISTINCT FROM OLD.tarif_base        OR
       NEW.tarif_cents       IS DISTINCT FROM OLD.tarif_cents       OR
       NEW.siret             IS DISTINCT FROM OLD.siret             OR
       NEW.organization_id   IS DISTINCT FROM OLD.organization_id
    THEN
      RAISE EXCEPTION 'forbidden field update by trainer self'
        USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END $$;

-- ── 2. Profil de facturation du formateur ───────────────────────────────────
CREATE TABLE IF NOT EXISTS app.trainer_billing_profiles (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  legal_name TEXT CHECK (legal_name IS NULL OR char_length(legal_name) <= 200),
  address_line TEXT CHECK (address_line IS NULL OR char_length(address_line) <= 300),
  postal_code TEXT CHECK (postal_code IS NULL OR char_length(postal_code) <= 20),
  city TEXT CHECK (city IS NULL OR char_length(city) <= 120),
  country TEXT NOT NULL DEFAULT 'France',
  siret TEXT CHECK (siret IS NULL OR siret ~ '^[0-9]{14}$'),
  vat_regime TEXT NOT NULL DEFAULT 'franchise' CHECK (vat_regime IN ('franchise', 'assujetti')),
  vat_rate NUMERIC(5,2) NOT NULL DEFAULT 20 CHECK (vat_rate BETWEEN 0 AND 30),
  vat_number TEXT CHECK (vat_number IS NULL OR char_length(vat_number) <= 30),
  iban TEXT CHECK (iban IS NULL OR iban ~ '^[A-Z]{2}[0-9A-Z]{13,32}$'),
  bic TEXT CHECK (bic IS NULL OR bic ~ '^[A-Z0-9]{8}([A-Z0-9]{3})?$'),
  invoice_prefix TEXT NOT NULL DEFAULT 'FAC' CHECK (invoice_prefix ~ '^[A-Z0-9-]{1,10}$'),
  next_invoice_number INT NOT NULL DEFAULT 1 CHECK (next_invoice_number >= 1),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── 3. Factures d'honoraires ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS app.trainer_invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES app.organizations(id) ON DELETE CASCADE,
  trainer_id UUID NOT NULL REFERENCES app.trainers(id) ON DELETE RESTRICT,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  source TEXT NOT NULL CHECK (source IN ('generee', 'deposee')),
  number TEXT NOT NULL CHECK (char_length(number) BETWEEN 1 AND 40),
  issue_date DATE NOT NULL,
  due_date DATE,
  subtotal_cents BIGINT NOT NULL CHECK (subtotal_cents >= 0),
  vat_cents BIGINT NOT NULL DEFAULT 0 CHECK (vat_cents >= 0),
  total_cents BIGINT NOT NULL CHECK (total_cents >= 0),
  expected_subtotal_cents BIGINT,
  status TEXT NOT NULL DEFAULT 'soumise' CHECK (status IN ('soumise', 'validee', 'refusee', 'payee')),
  pdf_path TEXT,
  issuer_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  notes TEXT CHECK (notes IS NULL OR char_length(notes) <= 1000),
  decided_by UUID,
  decided_at TIMESTAMPTZ,
  decision_note TEXT CHECK (decision_note IS NULL OR char_length(decision_note) <= 500),
  paid_at TIMESTAMPTZ,
  paid_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, number),
  CONSTRAINT trainer_invoices_decided_check CHECK ((status = 'soumise') = (decided_at IS NULL)),
  CONSTRAINT trainer_invoices_paid_check CHECK ((status = 'payee') = (paid_at IS NOT NULL))
);

CREATE TABLE IF NOT EXISTS app.trainer_invoice_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES app.trainer_invoices(id) ON DELETE CASCADE,
  session_id UUID REFERENCES app.sessions(id) ON DELETE SET NULL,
  position INT NOT NULL DEFAULT 0,
  label TEXT NOT NULL CHECK (char_length(label) BETWEEN 1 AND 300),
  quantity NUMERIC(8,2) NOT NULL CHECK (quantity > 0),
  unit TEXT NOT NULL,
  unit_price_cents BIGINT NOT NULL CHECK (unit_price_cents >= 0),
  total_cents BIGINT NOT NULL CHECK (total_cents >= 0)
);

CREATE TABLE IF NOT EXISTS app.trainer_invoice_sessions (
  invoice_id UUID NOT NULL REFERENCES app.trainer_invoices(id) ON DELETE CASCADE,
  session_id UUID NOT NULL REFERENCES app.sessions(id) ON DELETE CASCADE,
  PRIMARY KEY (invoice_id, session_id)
);

-- ── 4. Notes de frais ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS app.trainer_expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES app.organizations(id) ON DELETE CASCADE,
  trainer_id UUID NOT NULL REFERENCES app.trainers(id) ON DELETE RESTRICT,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  session_id UUID NOT NULL REFERENCES app.sessions(id) ON DELETE RESTRICT,
  expense_date DATE NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('transport', 'repas', 'hebergement', 'materiel', 'autre')),
  label TEXT NOT NULL CHECK (char_length(label) BETWEEN 1 AND 200),
  amount_cents BIGINT NOT NULL CHECK (amount_cents > 0 AND amount_cents <= 10000000),
  receipt_path TEXT NOT NULL,
  receipt_name TEXT NOT NULL,
  receipt_mime TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'soumise' CHECK (status IN ('soumise', 'validee', 'refusee', 'remboursee')),
  decided_by UUID,
  decided_at TIMESTAMPTZ,
  decision_note TEXT CHECK (decision_note IS NULL OR char_length(decision_note) <= 500),
  reimbursed_at TIMESTAMPTZ,
  reimbursed_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT trainer_expenses_decided_check CHECK ((status = 'soumise') = (decided_at IS NULL)),
  CONSTRAINT trainer_expenses_reimbursed_check CHECK ((status = 'remboursee') = (reimbursed_at IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS trainer_invoices_org_status_idx ON app.trainer_invoices (organization_id, status);
CREATE INDEX IF NOT EXISTS trainer_invoices_user_idx ON app.trainer_invoices (user_id);
CREATE INDEX IF NOT EXISTS trainer_invoice_sessions_session_idx ON app.trainer_invoice_sessions (session_id);
CREATE INDEX IF NOT EXISTS trainer_expenses_org_status_idx ON app.trainer_expenses (organization_id, status);
CREATE INDEX IF NOT EXISTS trainer_expenses_user_idx ON app.trainer_expenses (user_id);

-- ── 5. Accès ────────────────────────────────────────────────────────────────
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['trainer_billing_profiles', 'trainer_invoices', 'trainer_invoice_lines',
                           'trainer_invoice_sessions', 'trainer_expenses'] LOOP
    EXECUTE format('ALTER TABLE app.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE app.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON app.%I FROM PUBLIC, anon, authenticated', t);
    EXECUTE format('GRANT SELECT ON app.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON app.%I TO service_role', t);
  END LOOP;
END $$;

DROP POLICY IF EXISTS trainer_billing_profiles_self ON app.trainer_billing_profiles;
CREATE POLICY trainer_billing_profiles_self ON app.trainer_billing_profiles
  FOR SELECT TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS trainer_invoices_self ON app.trainer_invoices;
CREATE POLICY trainer_invoices_self ON app.trainer_invoices
  FOR SELECT TO authenticated USING (user_id = auth.uid());
DROP POLICY IF EXISTS trainer_invoices_org ON app.trainer_invoices;
CREATE POLICY trainer_invoices_org ON app.trainer_invoices
  FOR SELECT TO authenticated
  USING (organization_id = app.current_organization_id()
         AND app.current_role() IN ('owner', 'admin', 'gestionnaire', 'comptable'));

DROP POLICY IF EXISTS trainer_invoice_lines_read ON app.trainer_invoice_lines;
CREATE POLICY trainer_invoice_lines_read ON app.trainer_invoice_lines
  FOR SELECT TO authenticated USING (invoice_id IN (SELECT id FROM app.trainer_invoices));
DROP POLICY IF EXISTS trainer_invoice_sessions_read ON app.trainer_invoice_sessions;
CREATE POLICY trainer_invoice_sessions_read ON app.trainer_invoice_sessions
  FOR SELECT TO authenticated USING (invoice_id IN (SELECT id FROM app.trainer_invoices));

DROP POLICY IF EXISTS trainer_expenses_self ON app.trainer_expenses;
CREATE POLICY trainer_expenses_self ON app.trainer_expenses
  FOR SELECT TO authenticated USING (user_id = auth.uid());
DROP POLICY IF EXISTS trainer_expenses_org ON app.trainer_expenses;
CREATE POLICY trainer_expenses_org ON app.trainer_expenses
  FOR SELECT TO authenticated
  USING (organization_id = app.current_organization_id()
         AND app.current_role() IN ('owner', 'admin', 'gestionnaire', 'comptable'));

-- ── 6. Numérotation continue des factures générées ─────────────────────────
CREATE OR REPLACE FUNCTION app.next_trainer_invoice_number(p_user_id UUID)
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER SET search_path = app, public AS $$
DECLARE
  v_prefix TEXT;
  v_n INT;
BEGIN
  UPDATE app.trainer_billing_profiles
     SET next_invoice_number = next_invoice_number + 1, updated_at = now()
   WHERE user_id = p_user_id
  RETURNING invoice_prefix, next_invoice_number - 1 INTO v_prefix, v_n;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'billing_profile_missing' USING ERRCODE = 'P0001';
  END IF;
  RETURN format('%s-%s-%s', v_prefix, to_char(current_date, 'YYYY'), lpad(v_n::text, 4, '0'));
END $$;

REVOKE ALL ON FUNCTION app.next_trainer_invoice_number(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION app.next_trainer_invoice_number(UUID) TO service_role;

-- ── 7. Seau privé : factures et justificatifs, servis par URL signée ────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'trainer-billing', 'trainer-billing', false,
  10485760, -- 10 Mo
  ARRAY['application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'image/heic']
)
ON CONFLICT (id) DO UPDATE
  SET public = false,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

NOTIFY pgrst, 'reload schema';
