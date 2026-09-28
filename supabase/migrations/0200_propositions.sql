-- Propositions commerciales d'une demande, générées par IA et versionnées.
--
-- Demande d'Ismael le 28/09/2026. Une demande n'est pas encore un client : on
-- lui fait une PROPOSITION. Isma dépose le programme qu'il a conçu ; Laurie en
-- tirait à la main une proposition mise en forme (présentation, informations
-- générales, objectifs, modules, modalités, tarif) et un devis. L'IA produit
-- désormais cette proposition et son devis ; si elle ne convient pas, on
-- demande une V2, une V3… en disant ce qu'il faut changer. Les versions
-- précédentes restent consultables : on sait ce qui a été proposé, et quand.
--
-- Une seule proposition ACTIVE par demande : c'est elle que porte le devis
-- envoyé. Signé, le devis fait de la demande un client (dossier, convention).

CREATE TABLE IF NOT EXISTS app.propositions (
  id               UUID        PRIMARY KEY DEFAULT uuidv7(),
  organization_id  UUID        NOT NULL REFERENCES app.organizations(id) ON DELETE CASCADE,
  prospect_id      UUID        NOT NULL REFERENCES app.prospects(id) ON DELETE CASCADE,
  version          INTEGER     NOT NULL CHECK (version >= 1),
  statut           TEXT        NOT NULL DEFAULT 'active' CHECK (statut IN ('active', 'archivee', 'acceptee')),
  -- La proposition structurée (sections, modules, tarif), telle que l'IA l'a rédigée.
  contenu          JSONB       NOT NULL,
  -- Ce qu'on a demandé de changer pour obtenir cette version (NULL pour une V1).
  consignes        TEXT        CHECK (consignes IS NULL OR length(consignes) <= 4000),
  -- Le programme source, dans le bucket prospect-documents.
  programme_path   TEXT        NOT NULL,
  programme_nom    TEXT,
  quote_id         UUID        REFERENCES app.quotes(id) ON DELETE SET NULL,
  document_id      UUID        REFERENCES app.documents(id) ON DELETE SET NULL,
  -- Ce que le contrôle de cadre a relevé (ex. un mot qui fait « coaching »).
  alertes          TEXT[]      NOT NULL DEFAULT '{}',
  created_by       UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT propositions_version_unique UNIQUE (prospect_id, version)
);

CREATE INDEX IF NOT EXISTS ix_propositions_prospect ON app.propositions (prospect_id, version DESC);
CREATE INDEX IF NOT EXISTS ix_propositions_quote ON app.propositions (quote_id) WHERE quote_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ux_propositions_une_active
  ON app.propositions (prospect_id) WHERE statut = 'active';

ALTER TABLE app.propositions ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.propositions FORCE ROW LEVEL SECURITY;

-- Lecture : ceux qui voient les demandes (0128).
DROP POLICY IF EXISTS propositions_select ON app.propositions;
CREATE POLICY propositions_select ON app.propositions FOR SELECT TO authenticated
  USING (organization_id = app.current_organization_id() AND (app.is_staff() OR app.has_role('commercial')));

-- Écriture : service role ; les Server Actions gardent le rôle avant d'écrire.
DROP POLICY IF EXISTS propositions_write ON app.propositions;
CREATE POLICY propositions_write ON app.propositions FOR ALL TO service_role
  USING (true) WITH CHECK (true);

COMMENT ON TABLE app.propositions IS
  'Propositions commerciales d''une demande (V1, V2…), générées par IA depuis le programme déposé. Une seule active ; signée par le devis, elle passe « acceptee ».';

-- L'historique de la demande dit quand une proposition a été générée ou
-- acceptée. `document_unverified` était déjà écrit par le code (annuler la
-- vérification d'une pièce) mais refusé par la contrainte : l'événement se
-- perdait en silence.
ALTER TABLE app.prospect_events DROP CONSTRAINT IF EXISTS prospect_events_kind_check;
ALTER TABLE app.prospect_events ADD CONSTRAINT prospect_events_kind_check CHECK (kind IN (
  'document_verified', 'document_rejected', 'document_unverified',
  'demande_validated', 'demande_rejected', 'comment',
  'programme_depose', 'proposition_generee', 'proposition_acceptee'));
