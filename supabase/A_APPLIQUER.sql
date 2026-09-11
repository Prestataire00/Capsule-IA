-- ════════════════════════════════════════════════════════════════════════════
-- Capsule IA — migrations à appliquer
--
--   0150  espace formateur : le formateur (même externe) voit SES séances,
--         apprenants, feuilles d'émargement ; liaison fiche ↔ compte réparée
--   0151  espace formateur : questionnaires envoyés par le formateur,
--         évaluations anonymes (3 réponses minimum)
--   0152  devis et facturation façon RFC (autre chantier, déjà sur main)
--   0153  espace formateur : tarif sur la fiche (heure / jour / séance),
--         factures d'honoraires (générées ou déposées), notes de frais
--
-- Les migrations 0138 à 0149 sont déjà en production. Toutes sont
-- rejouables : sans risque si 0150 ou 0151 ont déjà été appliquées.
-- À coller dans l'éditeur SQL Supabase, puis « Run ».
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ───────────── 0150_espace_formateur_acces.sql ─────────────

-- 0150 — Espace formateur : le formateur accède à SES séances, sans être membre
--
-- Constat : toutes les politiques de lecture exigeaient l'organisme de la
-- session (`current_organization_id()`), qui n'est renseigné que pour un
-- MEMBRE de l'organisme. Un formateur externe (fiche formateur reliée à son
-- compte, sans rôle interne) ne voyait donc ni ses séances, ni ses apprenants,
-- ni ses feuilles d'émargement : « Mes sessions » était vide et l'émargement
-- introuvable.
--
--  · Fonctions « mes … » (SECURITY DEFINER, clé : trainers.user_id = auth.uid(),
--    fiche active et espace ouvert) : séances, dossiers, apprenants,
--    formations, feuilles du formateur connecté.
--  · Politiques de LECTURE ajoutées (elles s'additionnent aux politiques
--    existantes, qui ne changent pas). Les écritures passent par les actions
--    serveur gardées (`features/attendance/access.ts`).
--  · `link_my_trainer_rows` : sans type `citext` (non résolu selon le schéma de
--    l'extension), sans violer l'unicité (un compte, une fiche par organisme),
--    adresse confirmée seulement. Elle faisait planter l'espace formateur.
--
-- Rejouable sans risque.

-- ── 1. Fonctions « mes … » ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION app.uuid_ou_null(p TEXT)
RETURNS UUID LANGUAGE plpgsql IMMUTABLE AS $$
BEGIN
  RETURN p::uuid;
EXCEPTION WHEN others THEN
  RETURN NULL;
END $$;

CREATE OR REPLACE FUNCTION app.my_trainer_ids()
RETURNS SETOF UUID LANGUAGE sql STABLE SECURITY DEFINER SET search_path = app, public AS $$
  SELECT t.id FROM app.trainers t
   WHERE auth.uid() IS NOT NULL
     AND t.user_id = auth.uid()
     AND t.deleted_at IS NULL
     AND t.space_disabled_at IS NULL
$$;

-- Séances d'un utilisateur formateur : participant formateur, formateur de la
-- séance, ou formateur d'un dossier de la séance (direct ou de groupe).
CREATE OR REPLACE FUNCTION app.trainer_session_ids(p_user_id UUID)
RETURNS SETOF UUID LANGUAGE sql STABLE SECURITY DEFINER SET search_path = app, public AS $$
  WITH mes AS (
    SELECT t.id FROM app.trainers t
     WHERE p_user_id IS NOT NULL AND t.user_id = p_user_id
       AND t.deleted_at IS NULL AND t.space_disabled_at IS NULL
  )
  SELECT sp.session_id FROM app.session_participants sp
   WHERE sp.participant_kind = 'trainer' AND sp.trainer_id IN (SELECT id FROM mes)
  UNION
  SELECT st.session_id FROM app.session_trainers st
   WHERE st.deleted_at IS NULL AND st.trainer_id IN (SELECT id FROM mes)
  UNION
  SELECT sd.session_id FROM app.session_dossiers sd
    JOIN app.dossier_trainers dt ON dt.dossier_id = sd.dossier_id
   WHERE dt.trainer_id IN (SELECT id FROM mes)
  UNION
  SELECT s.id FROM app.sessions s
    JOIN app.dossier_trainers dt ON dt.dossier_id = s.dossier_id
   WHERE dt.trainer_id IN (SELECT id FROM mes)
$$;

CREATE OR REPLACE FUNCTION app.my_trainer_session_ids()
RETURNS SETOF UUID LANGUAGE sql STABLE SECURITY DEFINER SET search_path = app, public AS $$
  SELECT app.trainer_session_ids(auth.uid())
$$;

CREATE OR REPLACE FUNCTION app.my_trainer_dossier_ids()
RETURNS SETOF UUID LANGUAGE sql STABLE SECURITY DEFINER SET search_path = app, public AS $$
  WITH seances AS (SELECT app.trainer_session_ids(auth.uid()) AS id)
  SELECT dt.dossier_id FROM app.dossier_trainers dt
   WHERE dt.trainer_id IN (SELECT app.my_trainer_ids())
  UNION
  SELECT sd.dossier_id FROM app.session_dossiers sd
   WHERE sd.session_id IN (SELECT id FROM seances)
  UNION
  SELECT s.dossier_id FROM app.sessions s
   WHERE s.dossier_id IS NOT NULL AND s.id IN (SELECT id FROM seances)
$$;

CREATE OR REPLACE FUNCTION app.my_trainer_learner_ids()
RETURNS SETOF UUID LANGUAGE sql STABLE SECURITY DEFINER SET search_path = app, public AS $$
  SELECT d.learner_id FROM app.dossiers d
   WHERE d.deleted_at IS NULL AND d.learner_id IS NOT NULL
     AND d.id IN (SELECT app.my_trainer_dossier_ids())
  UNION
  SELECT sp.learner_id FROM app.session_participants sp
   WHERE sp.participant_kind = 'learner'
     AND sp.session_id IN (SELECT app.trainer_session_ids(auth.uid()))
$$;

CREATE OR REPLACE FUNCTION app.my_trainer_formation_ids()
RETURNS SETOF UUID LANGUAGE sql STABLE SECURITY DEFINER SET search_path = app, public AS $$
  SELECT s.formation_id FROM app.sessions s
   WHERE s.formation_id IS NOT NULL AND s.id IN (SELECT app.trainer_session_ids(auth.uid()))
  UNION
  SELECT d.formation_id FROM app.dossiers d
   WHERE d.formation_id IS NOT NULL AND d.id IN (SELECT app.my_trainer_dossier_ids())
$$;

CREATE OR REPLACE FUNCTION app.my_trainer_sheet_ids()
RETURNS SETOF UUID LANGUAGE sql STABLE SECURITY DEFINER SET search_path = app, public AS $$
  SELECT sh.id FROM app.attendance_sheets sh
   WHERE sh.session_id IN (SELECT app.trainer_session_ids(auth.uid()))
$$;

-- ── 2. Lecture : séances, apprenants, feuilles du formateur ─────────────────
DROP POLICY IF EXISTS sessions_formateur_espace ON app.sessions;
CREATE POLICY sessions_formateur_espace ON app.sessions
  FOR SELECT TO authenticated USING (id IN (SELECT app.my_trainer_session_ids()));

DROP POLICY IF EXISTS session_participants_formateur_espace ON app.session_participants;
CREATE POLICY session_participants_formateur_espace ON app.session_participants
  FOR SELECT TO authenticated USING (session_id IN (SELECT app.my_trainer_session_ids()));

DROP POLICY IF EXISTS session_dossiers_formateur_espace ON app.session_dossiers;
CREATE POLICY session_dossiers_formateur_espace ON app.session_dossiers
  FOR SELECT TO authenticated USING (session_id IN (SELECT app.my_trainer_session_ids()));

DROP POLICY IF EXISTS session_trainers_formateur_espace ON app.session_trainers;
CREATE POLICY session_trainers_formateur_espace ON app.session_trainers
  FOR SELECT TO authenticated USING (trainer_id IN (SELECT app.my_trainer_ids()));

DROP POLICY IF EXISTS dossier_trainers_formateur_espace ON app.dossier_trainers;
CREATE POLICY dossier_trainers_formateur_espace ON app.dossier_trainers
  FOR SELECT TO authenticated USING (trainer_id IN (SELECT app.my_trainer_ids()));

DROP POLICY IF EXISTS dossiers_formateur_espace ON app.dossiers;
CREATE POLICY dossiers_formateur_espace ON app.dossiers
  FOR SELECT TO authenticated USING (id IN (SELECT app.my_trainer_dossier_ids()));

DROP POLICY IF EXISTS learners_formateur_espace ON app.learners;
CREATE POLICY learners_formateur_espace ON app.learners
  FOR SELECT TO authenticated USING (id IN (SELECT app.my_trainer_learner_ids()));

DROP POLICY IF EXISTS formations_formateur_espace ON app.formations;
CREATE POLICY formations_formateur_espace ON app.formations
  FOR SELECT TO authenticated USING (id IN (SELECT app.my_trainer_formation_ids()));

DROP POLICY IF EXISTS attendance_sheets_formateur_espace ON app.attendance_sheets;
CREATE POLICY attendance_sheets_formateur_espace ON app.attendance_sheets
  FOR SELECT TO authenticated USING (session_id IN (SELECT app.my_trainer_session_ids()));

DROP POLICY IF EXISTS attendance_signatures_formateur_espace ON app.attendance_signatures;
CREATE POLICY attendance_signatures_formateur_espace ON app.attendance_signatures
  FOR SELECT TO authenticated USING (attendance_sheet_id IN (SELECT app.my_trainer_sheet_ids()));

DROP POLICY IF EXISTS attendance_justifications_formateur_espace ON app.attendance_justifications;
CREATE POLICY attendance_justifications_formateur_espace ON app.attendance_justifications
  FOR SELECT TO authenticated USING (attendance_sheet_id IN (SELECT app.my_trainer_sheet_ids()));

-- Documents : feuilles clôturées de ses séances, et son contrat.
DROP POLICY IF EXISTS documents_formateur_espace ON app.documents;
CREATE POLICY documents_formateur_espace ON app.documents
  FOR SELECT TO authenticated
  USING (
    deleted_at IS NULL
    AND (
      (kind = 'feuille_emargement_signee'
        AND app.uuid_ou_null(metadata ->> 'session_id') IN (SELECT app.my_trainer_session_ids()))
      OR (kind = 'trainer_contract'
        AND app.uuid_ou_null(metadata ->> 'trainer_id') IN (SELECT app.my_trainer_ids()))
    )
  );

-- ── 3. Liaison fiche ↔ compte, sans planter ─────────────────────────────────
CREATE OR REPLACE FUNCTION app.link_my_trainer_rows()
RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = app, public AS $$
DECLARE
  v_email TEXT;
  v_count INTEGER;
BEGIN
  SELECT lower(u.email::text) INTO v_email
    FROM auth.users u
   WHERE u.id = auth.uid() AND u.email_confirmed_at IS NOT NULL;
  IF v_email IS NULL THEN RETURN 0; END IF;

  UPDATE app.trainers t
     SET user_id = auth.uid(), updated_at = now()
   WHERE lower(t.email::text) = v_email
     AND t.user_id IS NULL
     AND t.deleted_at IS NULL
     AND NOT EXISTS (
       SELECT 1 FROM app.trainers o
        WHERE o.user_id = auth.uid() AND o.organization_id = t.organization_id AND o.deleted_at IS NULL);

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END $$;

-- ── 4. Droits ───────────────────────────────────────────────────────────────
DO $$
DECLARE f TEXT;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'app.my_trainer_ids()', 'app.my_trainer_session_ids()', 'app.my_trainer_dossier_ids()',
    'app.my_trainer_learner_ids()', 'app.my_trainer_formation_ids()', 'app.my_trainer_sheet_ids()',
    'app.link_my_trainer_rows()', 'app.uuid_ou_null(text)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', f);
  END LOOP;
  -- Séances d'un utilisateur quelconque : réservé au serveur (flux calendrier).
  REVOKE ALL ON FUNCTION app.trainer_session_ids(UUID) FROM PUBLIC, anon, authenticated;
  GRANT EXECUTE ON FUNCTION app.trainer_session_ids(UUID) TO service_role;
END $$;

NOTIFY pgrst, 'reload schema';

-- ───────────── 0151_espace_formateur_questionnaires.sql ─────────────

-- 0151 — Espace formateur : questionnaires envoyés par le formateur, évaluations reçues
--
--  · Une affectation porte la séance et le formateur qui l'a envoyée.
--  · Suivi d'une séance (`my_session_questionnaires`) : pour les tests
--    pédagogiques (positionnement, acquis, personnalisé), le formateur voit le
--    résultat de chaque apprenant ; pour les questionnaires de satisfaction,
--    ni nom, ni réponse, ni score — ils sont annoncés anonymes aux apprenants.
--  · « Mes évaluations » (`my_trainer_evaluations`) : moyennes de satisfaction
--    et note du formateur par formation, et commentaires sans nom, seulement à
--    partir de trois réponses (en deçà, une réponse se reconnaîtrait).
--
-- Rejouable sans risque.

ALTER TABLE app.questionnaire_assignments
  ADD COLUMN IF NOT EXISTS session_id UUID REFERENCES app.sessions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS sent_by_trainer_id UUID REFERENCES app.trainers(id) ON DELETE SET NULL;

COMMENT ON COLUMN app.questionnaire_assignments.session_id IS 'Séance pour laquelle le questionnaire a été envoyé (0151).';
COMMENT ON COLUMN app.questionnaire_assignments.sent_by_trainer_id IS 'Formateur qui l''a envoyé depuis son espace (0151).';

CREATE INDEX IF NOT EXISTS questionnaire_assignments_session_idx
  ON app.questionnaire_assignments (session_id) WHERE session_id IS NOT NULL;

CREATE OR REPLACE FUNCTION app.est_satisfaction(p_kind TEXT)
RETURNS BOOLEAN LANGUAGE sql IMMUTABLE AS $$
  SELECT p_kind IN ('satisfaction_chaud', 'satisfaction_froid', 'satisfaction_formateur')
$$;

-- ── Suivi des questionnaires d'une séance du formateur ─────────────────────
CREATE OR REPLACE FUNCTION app.my_session_questionnaires(p_session_id UUID)
RETURNS TABLE (
  assignment_id UUID,
  template_id UUID,
  template_title TEXT,
  kind TEXT,
  learner_name TEXT,
  status TEXT,
  created_at TIMESTAMPTZ,
  submitted_at TIMESTAMPTZ,
  score NUMERIC,
  answers JSONB,
  questions JSONB
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = app, public AS $$
  SELECT a.id, t.id, t.title, t.kind::text,
         CASE WHEN app.est_satisfaction(t.kind::text) THEN NULL
              ELSE COALESCE(NULLIF(btrim(concat_ws(' ', l.first_name, l.last_name)), ''), a.recipient_name, 'Apprenant') END,
         a.status::text, a.created_at, r.submitted_at,
         CASE WHEN app.est_satisfaction(t.kind::text) THEN NULL ELSE r.score END,
         CASE WHEN app.est_satisfaction(t.kind::text) THEN NULL ELSE r.answers END,
         CASE WHEN app.est_satisfaction(t.kind::text) THEN NULL ELSE t.schema -> 'questions' END
    FROM app.questionnaire_assignments a
    JOIN app.questionnaire_templates t ON t.id = a.template_id
    LEFT JOIN app.learners l ON l.id = a.recipient_learner_id
    LEFT JOIN app.questionnaire_responses r ON r.assignment_id = a.id
   WHERE p_session_id IN (SELECT app.my_trainer_session_ids())
     AND a.recipient_kind = 'learner'
     AND (a.session_id = p_session_id
          OR (a.session_id IS NULL AND a.dossier_id IN (
                SELECT s.dossier_id FROM app.sessions s WHERE s.id = p_session_id
                UNION
                SELECT sd.dossier_id FROM app.session_dossiers sd WHERE sd.session_id = p_session_id)))
   ORDER BY 3, 5 NULLS LAST
$$;

-- ── Évaluations reçues par le formateur ────────────────────────────────────
-- Note du formateur : questions « rating » d'une évaluation du formateur, ou
-- dont l'intitulé parle du formateur (satisfaction à chaud, q3), ramenées sur 5.
CREATE OR REPLACE FUNCTION app.my_trainer_evaluations()
RETURNS TABLE (
  formation_id UUID,
  formation_title TEXT,
  responses INT,
  satisfaction_avg NUMERIC,
  trainer_avg NUMERIC,
  last_submitted_at TIMESTAMPTZ,
  comments TEXT[]
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = app, public AS $$
  WITH reponses AS (
    SELECT r.id, r.score, r.answers, r.submitted_at, t.kind::text AS kind, t.schema, d.formation_id
      FROM app.questionnaire_responses r
      JOIN app.questionnaire_assignments a ON a.id = r.assignment_id
      JOIN app.questionnaire_templates t ON t.id = r.template_id
      JOIN app.dossiers d ON d.id = a.dossier_id
     WHERE a.recipient_kind = 'learner'
       AND t.kind::text IN ('satisfaction_chaud', 'satisfaction_formateur')
       AND (a.sent_by_trainer_id IN (SELECT app.my_trainer_ids())
            OR a.session_id IN (SELECT app.my_trainer_session_ids())
            OR a.dossier_id IN (SELECT app.my_trainer_dossier_ids()))
  ),
  notes AS (
    SELECT rep.id,
           avg((rep.answers ->> (q ->> 'id'))::numeric
               / NULLIF(COALESCE(NULLIF(q ->> 'max', '')::numeric, 5), 0) * 5) AS note
      FROM reponses rep
      CROSS JOIN LATERAL jsonb_array_elements(COALESCE(rep.schema -> 'questions', '[]'::jsonb)) q
     WHERE q ->> 'type' = 'rating'
       AND (rep.kind = 'satisfaction_formateur' OR q ->> 'label' ILIKE '%formateur%')
       AND (rep.answers ->> (q ->> 'id')) ~ '^[0-9]+(\.[0-9]+)?$'
     GROUP BY rep.id
  ),
  textes AS (
    SELECT rep.id, rep.formation_id, rep.submitted_at, btrim(rep.answers ->> (q ->> 'id')) AS texte
      FROM reponses rep
      CROSS JOIN LATERAL jsonb_array_elements(COALESCE(rep.schema -> 'questions', '[]'::jsonb)) q
     WHERE q ->> 'type' = 'text'
       AND btrim(COALESCE(rep.answers ->> (q ->> 'id'), '')) <> ''
  ),
  agg AS (
    SELECT rep.formation_id, GROUPING(rep.formation_id) AS global, count(*)::int AS n,
           avg(rep.score) / 20 AS sat, avg(n.note) AS note, max(rep.submitted_at) AS dernier
      FROM reponses rep
      LEFT JOIN notes n ON n.id = rep.id
     GROUP BY GROUPING SETS ((rep.formation_id), ())
    -- Le regroupement total produit une ligne même sans aucune réponse.
    HAVING count(*) > 0
  ),
  com AS (
    SELECT tx.formation_id, array_agg(tx.texte ORDER BY tx.submitted_at DESC) AS commentaires
      FROM textes tx
     GROUP BY tx.formation_id
  )
  SELECT CASE WHEN a.global = 1 THEN NULL ELSE a.formation_id END,
         CASE WHEN a.global = 1 THEN 'Toutes vos formations' ELSE COALESCE(f.title, 'Formation') END,
         a.n,
         CASE WHEN a.n >= 3 THEN round(a.sat, 2) END,
         CASE WHEN a.n >= 3 THEN round(a.note, 2) END,
         a.dernier,
         CASE WHEN a.n >= 3 AND a.global = 0 THEN c.commentaires END
    FROM agg a
    LEFT JOIN com c ON a.global = 0 AND c.formation_id IS NOT DISTINCT FROM a.formation_id
    LEFT JOIN app.formations f ON a.global = 0 AND f.id = a.formation_id
   ORDER BY a.global DESC, a.dernier DESC NULLS LAST
$$;

DO $$
DECLARE f TEXT;
BEGIN
  FOREACH f IN ARRAY ARRAY['app.my_session_questionnaires(uuid)', 'app.my_trainer_evaluations()'] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', f);
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';

-- ───────────── 0152_devis_facturation.sql ─────────────

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

-- ───────────── 0153_espace_formateur_facturation.sql ─────────────

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

COMMIT;
