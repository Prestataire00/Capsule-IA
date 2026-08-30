-- ════════════════════════════════════════════════════════════════════════════
-- Capsule IA — migrations à appliquer en production
--
-- À coller tel quel dans l'éditeur SQL Supabase (SQL Editor → New query → Run).
-- L'ordre compte : 0130 ferme la faille critique, 0131 rend la révocation
-- possible, 0128 et 0129 débloquent deux fonctionnalités livrées mais inertes.
--
-- Ces quatre migrations n'ont pas pu être appliquées par la chaîne habituelle
-- (blocage de facturation GitHub Actions). Une fois jouées ici, le workflow
-- `db-migrate` les considérera comme déjà appliquées.
--
-- Généré le 2026-08-30 · audit CAP-04, CAP-13, CAP-14
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─────────────────────────────────────────────────────────
-- 0130_revoke_anon_learner_rpcs.sql
-- ─────────────────────────────────────────────────────────

-- 0130 — Ferme à `anon` les RPC qui prennent un UUID pour seule autorisation.
--
-- Constat (audit 2026-08-30, CAP-13) : cinq fonctions SECURITY DEFINER étaient
-- exécutables depuis Internet avec la clé `anon` — publique, embarquée dans le
-- bundle navigateur. Leur seul contrôle d'accès était la connaissance d'un UUID
-- d'apprenant (ou de feuille d'émargement).
--
-- Or cet UUID n'est pas un secret : il est inscrit en clair dans la charge utile
-- base64 du jeton de l'espace apprenant. Quiconque détient un lien — y compris
-- un lien EXPIRÉ, un lien transféré, une capture d'écran — en extrait l'UUID et
-- interroge la base directement, sans jeton et sans limite de durée.
-- L'expiration des liens ne protégeait donc rien.
--
-- Vérifié en production le 2026-08-30 : les quatre RPC apprenant répondaient
-- HTTP 200 à un appel anonyme.
--
-- Les appelants légitimes (espace apprenant, page de signature) sont passés au
-- service role dans le même lot — ce retrait ne casse aucun parcours.
-- Les RPC du catalogue public (`public.get_published_*`) restent ouvertes à
-- `anon` : elles ne servent que des données déjà publiées.

REVOKE EXECUTE ON FUNCTION app.get_apprenant_dashboard(UUID) FROM anon;
REVOKE EXECUTE ON FUNCTION app.get_learner_complaints(UUID) FROM anon;
REVOKE EXECUTE ON FUNCTION app.get_apprenant_resources(UUID) FROM anon;
REVOKE EXECUTE ON FUNCTION app.get_apprenant_exercises(UUID) FROM anon;
REVOKE EXECUTE ON FUNCTION app.get_signature_context(UUID, UUID, TEXT) FROM anon;

-- Le service role doit pouvoir les exécuter (il ne l'avait pas partout).
GRANT EXECUTE ON FUNCTION app.get_apprenant_dashboard(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION app.get_learner_complaints(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION app.get_apprenant_resources(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION app.get_signature_context(UUID, UUID, TEXT) TO service_role;

-- ─────────────────────────────────────────────────────────
-- 0131_link_revocations.sql
-- ─────────────────────────────────────────────────────────

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

-- ─────────────────────────────────────────────────────────
-- 0128_prospect_events_commercial.sql
-- ─────────────────────────────────────────────────────────

-- 0128 — Notes de suivi d'une demande : lecture/écriture pour les commerciaux
--
-- Les notes internes d'une demande (« appelée le 12/03, rappeler après le 20 »)
-- sont stockées dans app.prospect_events. Ses policies ne laissaient passer que
-- `app.is_staff()` (owner / admin / gestionnaire) : un commercial pouvait ouvrir
-- la fiche demande mais ne voyait aucune note et ne pouvait pas en écrire — or
-- c'est précisément lui qui contacte le prospect et transmet à l'administratif.
--
-- La section CRM leur est ouverte côté application ; on aligne la RLS.

DROP POLICY IF EXISTS pe_select ON app.prospect_events;
CREATE POLICY pe_select ON app.prospect_events FOR SELECT TO authenticated
  USING (
    organization_id = app.current_organization_id()
    AND (app.is_staff() OR app.has_role('commercial'))
  );

DROP POLICY IF EXISTS pe_insert ON app.prospect_events;
CREATE POLICY pe_insert ON app.prospect_events FOR INSERT TO authenticated
  WITH CHECK (
    organization_id = app.current_organization_id()
    AND (app.is_staff() OR app.has_role('commercial'))
  );

NOTIFY pgrst, 'reload schema';

-- ─────────────────────────────────────────────────────────
-- 0129_email_schedule_event_anchors.sql
-- ─────────────────────────────────────────────────────────

-- 0129 — Déclencheurs événementiels pour les règles d'envoi programmé
--
-- Les règles ne pouvaient se caler que sur des dates (début/fin de formation,
-- première session). Or l'essentiel du suivi commercial se déclenche sur des
-- ÉVÉNEMENTS : la signature d'un devis, celle de la convention, le règlement
-- d'une facture. On étend l'ancre plutôt que d'ajouter une table : l'événement
-- fournit simplement la date à laquelle le décalage en jours s'applique.

ALTER TABLE app.email_schedules DROP CONSTRAINT IF EXISTS email_schedules_anchor_check;

ALTER TABLE app.email_schedules
  ADD CONSTRAINT email_schedules_anchor_check CHECK (anchor IN (
    -- Ancres calendaires (existantes)
    'first_session_start',
    'dossier_start',
    'dossier_end',
    -- Ancres événementielles
    'last_session_end',
    'dossier_created',
    'devis_signed',
    'convention_signed',
    'invoice_paid'
  ));

COMMENT ON COLUMN app.email_schedules.anchor IS
  'Point de départ du décalage : date (début/fin de formation, 1re session, fin de la dernière session) ou événement (création du dossier, signature du devis ou de la convention, règlement de la facture).';

NOTIFY pgrst, 'reload schema';

COMMIT;
