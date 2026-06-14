-- ============================================================================
-- 0057 — Table app.resource_access_log (journal d'audit append-only)
-- ============================================================================
-- Journal unifié et polymorphe pour les accès aux ressources pédagogiques :
-- documents Qualiopi, supports de module, replays.
--
-- Choix d'architecture :
--   • target_id sans FK réelle : la preuve d'accès doit survivre à la
--     suppression de la ressource cible (conformité Qualiopi).
--   • Pas de policy INSERT/UPDATE/DELETE : l'écriture est réservée au
--     service_role (Edge Functions, webhooks) qui bypass RLS par design.
--     Exposer une policy INSERT aux utilisateurs authentifiés permettrait
--     l'injection de fausses preuves d'accès — inacceptable pour l'audit.

CREATE TABLE app.resource_access_log (
  id              UUID        PRIMARY KEY DEFAULT uuidv7(),
  organization_id UUID        NOT NULL REFERENCES app.organizations(id) ON DELETE CASCADE,
  target_kind     TEXT        NOT NULL CHECK (target_kind IN ('document', 'module_resource', 'replay')),
  target_id       UUID        NOT NULL,   -- référence souple, pas de FK
  dossier_id      UUID        REFERENCES app.dossiers(id) ON DELETE SET NULL,
  learner_id      UUID        REFERENCES app.learners(id) ON DELETE SET NULL,
  actor_kind      TEXT        NOT NULL CHECK (actor_kind IN ('learner_token', 'user', 'system')),
  action          TEXT        NOT NULL CHECK (action IN ('view', 'download')),
  ip              INET,
  user_agent      TEXT,
  occurred_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index principal : requêtes de suivi par dossier (vue Qualiopi)
CREATE INDEX ix_resource_access_log_org_dossier
  ON app.resource_access_log (organization_id, dossier_id, occurred_at DESC);

-- Index secondaire : recherche par ressource cible (quel accès sur quel fichier)
CREATE INDEX ix_resource_access_log_target
  ON app.resource_access_log (target_kind, target_id);

-- ── RLS ───────────────────────────────────────────────────────────────────────

ALTER TABLE app.resource_access_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.resource_access_log FORCE ROW LEVEL SECURITY;

-- Lecture : tout membre de l'organisation peut consulter les logs de ses accès
-- (audit interne, tableau de bord traçabilité).
CREATE POLICY resource_access_log_select ON app.resource_access_log FOR SELECT
  USING (organization_id = app.current_organization_id());

-- INSERT / UPDATE / DELETE : aucune policy intentionnellement.
-- L'écriture est réservée au service_role (Edge Functions) qui bypass RLS.
-- Voir commentaire d'en-tête pour le raisonnement sécurité.
