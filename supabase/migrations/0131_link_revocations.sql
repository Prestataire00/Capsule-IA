-- 0131 — Révocation des liens envoyés aux apprenants et aux formateurs.
--
-- Constat (audit 2026-08-30, CAP-14) : six familles de jetons sur sept
-- produisent un `jti` que rien ne stocke ni ne vérifie. Un lien envoyé à la
-- mauvaise adresse, transféré, ou lié à un apprenant qui quitte la formation
-- reste actif jusqu'à son terme — 90 jours pour l'espace apprenant, 60 pour les
-- questionnaires. Le seul moyen de le couper était de changer
-- `TOKEN_SIGNING_KEY`, ce qui invalide tous les liens de tous les organismes.
--
-- Choix de conception : on ne révoque pas un jeton, on révoque un **dossier**.
-- L'organisme ne connaît pas les `jti` — ils ne lui sont affichés nulle part —
-- alors qu'il raisonne naturellement en dossier. Une révocation pose une date
-- butoir : tout jeton émis AVANT cette date est refusé, tout lien réémis après
-- fonctionne. C'est ce qui permet de répondre à une demande d'effacement RGPD
-- sans casser les autres dossiers.

CREATE TABLE app.link_revocations (
  dossier_id      UUID PRIMARY KEY REFERENCES app.dossiers(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES app.organizations(id) ON DELETE CASCADE,
  revoked_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_by      UUID REFERENCES app.members(id) ON DELETE SET NULL,
  reason          TEXT
);

CREATE INDEX ix_link_revocations_org ON app.link_revocations(organization_id);

ALTER TABLE app.link_revocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.link_revocations FORCE ROW LEVEL SECURITY;

CREATE POLICY link_revocations_select ON app.link_revocations FOR SELECT
USING (organization_id = app.current_organization_id());

CREATE POLICY link_revocations_insert ON app.link_revocations FOR INSERT
WITH CHECK (organization_id = app.current_organization_id() AND app.is_staff());

CREATE POLICY link_revocations_update ON app.link_revocations FOR UPDATE
USING (organization_id = app.current_organization_id() AND app.is_staff())
WITH CHECK (organization_id = app.current_organization_id() AND app.is_staff());

-- Pas de policy DELETE : lever une révocation se fait en réémettant un lien,
-- pas en effaçant la trace de la révocation.

COMMENT ON TABLE app.link_revocations IS
  'Date butoir par dossier : tout jeton émis avant `revoked_at` est refusé (audit CAP-14).';
