-- Décision du financeur : accord, refus, et montant réellement accordé.
--
-- `dossier_funders.status` existait depuis la 0007 (pending / approved /
-- refused / paid) mais rien ne permettait d'en changer : toute ligne restait
-- « en attente » à vie. On ne savait donc pas si l'OPCO avait accepté, et le
-- plan de facturation comptait sa part comme acquise dans tous les cas.
--
-- Deux manques comblés ici :
--   • l'état « déposé » — le dossier est parti chez le financeur, on attend sa
--     réponse. C'est différent de « à déposer », et c'est là que se joue le
--     suivi ;
--   • le montant ACCORDÉ, souvent inférieur au montant demandé. Sans lui, le
--     reste à charge de l'entreprise est sous-évalué et la facture est fausse.

ALTER TABLE app.dossier_funders DROP CONSTRAINT IF EXISTS dossier_funders_status_check;
ALTER TABLE app.dossier_funders ADD CONSTRAINT dossier_funders_status_check
  CHECK (status IN ('pending', 'submitted', 'approved', 'refused', 'paid'));

ALTER TABLE app.dossier_funders
  -- Montant accordé par le financeur. NULL tant qu'il n'a pas répondu ; à
  -- l'accord, c'est lui qui fait foi pour la facturation, pas le demandé.
  ADD COLUMN IF NOT EXISTS granted_cents BIGINT
    CHECK (granted_cents IS NULL OR granted_cents >= 0),
  ADD COLUMN IF NOT EXISTS submitted_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS decided_at    TIMESTAMPTZ,
  -- Motif du refus, ou numéro d'accord : ce qu'on relira dans six mois.
  ADD COLUMN IF NOT EXISTS decision_note TEXT
    CHECK (decision_note IS NULL OR length(decision_note) <= 1000);

-- Suivi de l'organisme : « qu'attend-on, et depuis quand ».
CREATE INDEX IF NOT EXISTS ix_dossier_funders_en_attente
  ON app.dossier_funders (organization_id, status, submitted_at)
  WHERE status IN ('pending', 'submitted');

COMMENT ON COLUMN app.dossier_funders.status IS
  'pending (à déposer) | submitted (déposé, en attente) | approved (accord) | refused (refus) | paid (payé).';
COMMENT ON COLUMN app.dossier_funders.granted_cents IS
  'Montant accordé par le financeur, souvent inférieur au demandé. NULL = pas encore de décision.';
COMMENT ON COLUMN app.dossier_funders.decision_note IS
  'Motif du refus ou numéro d''accord — ce qui justifie la décision en audit.';
