-- ════════════════════════════════════════════════════════════════════════════
-- Capsule IA — migrations à appliquer en production
--
-- À coller tel quel dans l'éditeur SQL Supabase (SQL Editor → New query → Run).
--   0130  ferme les RPC apprenant aux appels anonymes          (critique)
--   0131  rend les liens envoyés révocables                    (majeur)
--   0132  retire la tolérance « organisation nulle » sur les prospects
--   0133  cloisonne par organisme la lecture de quatre seaux   (critique)
--   0134  deux index sur des colonnes très filtrées
--   0135  saisie manuelle des indicateurs de résultats         (fonctionnalité)
--   0128  notes de suivi visibles par les commerciaux
--   0129  déclencheurs événementiels des envois programmés
--
-- Généré le 2026-09-03
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
-- 0132_prospects_org_stricte.sql
-- ─────────────────────────────────────────────────────────

-- 0132 — Retire la tolérance « organisation nulle » sur les prospects.
--
-- Constat (audit 2026-08-31, CAP-19) : trois policies de `app.prospects`
-- acceptaient `organization_id IS NULL`, ce qui rend une telle ligne lisible ET
-- modifiable par n'importe quel utilisateur authentifié, quel que soit son
-- organisme. Or un prospect porte des données personnelles : identité, e-mail,
-- téléphone, date de naissance, RQTH, situation, pièces jointes.
--
-- Ce motif est légitime ailleurs — gabarits de documents, indicateurs Qualiopi,
-- playbooks financeurs, drapeaux de fonctionnalité : une ligne sans organisation
-- y désigne un modèle fourni par la plateforme et partagé par tous. Il ne l'est
-- pas pour une personne physique.
--
-- Faille **latente** au moment du constat : aucun chemin du code ne crée de
-- prospect sans organisation (le formulaire public la déduit de la formation),
-- et la production n'en contient aucun. La colonne l'autorise pourtant — un
-- import ou une insertion manuelle suffirait.

DROP POLICY IF EXISTS prospects_select ON app.prospects;
CREATE POLICY prospects_select ON app.prospects FOR SELECT TO authenticated
USING (organization_id = app.current_organization_id() AND deleted_at IS NULL);

DROP POLICY IF EXISTS prospects_update ON app.prospects;
CREATE POLICY prospects_update ON app.prospects FOR UPDATE TO authenticated
USING (organization_id = app.current_organization_id() AND deleted_at IS NULL)
WITH CHECK (organization_id = app.current_organization_id());

DROP POLICY IF EXISTS prospects_referent_read ON app.prospects;
CREATE POLICY prospects_referent_read ON app.prospects FOR SELECT TO authenticated
USING (
  organization_id = app.current_organization_id()
  AND deleted_at IS NULL
  AND app.has_role('referent')
);

-- ─────────────────────────────────────────────────────────
-- 0133_storage_cloisonnement.sql
-- ─────────────────────────────────────────────────────────

-- 0133 — Cloisonne par organisme la lecture de quatre seaux de stockage.
--
-- Constat (audit 2026-08-31, CAP-20) : quatre policies de lecture n'avaient pour
-- seule condition que « le seau est bien celui-ci ». Aucune borne d'organisation,
-- aucune borne d'utilisateur :
--
--     USING (bucket_id = 'signatures')
--
-- Tout compte authentifié — donc un membre de n'importe quel autre organisme de
-- la plateforme — pouvait non seulement télécharger ces objets, mais aussi les
-- **lister** : `storage.list()` s'appuie sur ce même SELECT. Il n'y avait donc
-- même pas d'identifiant à deviner.
--
--   signatures         images de signature manuscrite des apprenants et formateurs
--   prospect-documents pièces jointes des prospects (identité, justificatifs)
--   pedagogical        supports de cours — le fonds de commerce de l'organisme
--   zoom_imports       CSV de présence Zoom, avec noms et adresses des participants
--
-- Le premier est le plus grave : une signature manuscrite est réutilisable, et
-- son exposition affaiblit la valeur probante de l'émargement.
--
-- Chaque chemin d'objet commence par un identifiant qui permet de remonter à
-- l'organisation ; les policies s'appuient dessus, comme le fait déjà
-- `pedagogical_staff_insert` (migration 0077).

-- ── signatures : {attendance_sheet_id}/{kind}/{signer_id}.png ───────────────
DROP POLICY IF EXISTS "signatures_member_read" ON storage.objects;
CREATE POLICY "signatures_member_read"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'signatures'
    AND EXISTS (
      SELECT 1 FROM app.attendance_sheets s
      WHERE s.id::text = (storage.foldername(name))[1]
        AND s.organization_id = app.current_organization_id()
    )
  );

-- ── zoom_imports : {attendance_sheet_id}/{horodatage}-{fichier}.csv ─────────
DROP POLICY IF EXISTS "zoom_imports_member_read" ON storage.objects;
CREATE POLICY "zoom_imports_member_read"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'zoom_imports'
    AND EXISTS (
      SELECT 1 FROM app.attendance_sheets s
      WHERE s.id::text = (storage.foldername(name))[1]
        AND s.organization_id = app.current_organization_id()
    )
  );

-- ── prospect-documents : {prospect_id}/{clé}.{ext} ──────────────────────────
DROP POLICY IF EXISTS "prospect_docs_member_read" ON storage.objects;
CREATE POLICY "prospect_docs_member_read"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'prospect-documents'
    AND EXISTS (
      SELECT 1 FROM app.prospects p
      WHERE p.id::text = (storage.foldername(name))[1]
        AND p.organization_id = app.current_organization_id()
    )
  );

-- ── pedagogical : {organization_id}/{module_id}/{fichier} ───────────────────
-- L'organisation est déjà le premier segment du chemin : même idiome que la
-- policy d'écriture posée en 0077.
DROP POLICY IF EXISTS "pedagogical_member_read" ON storage.objects;
CREATE POLICY "pedagogical_member_read"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'pedagogical'
    AND (storage.foldername(name))[1] = app.current_organization_id()::text
  );

-- ─────────────────────────────────────────────────────────
-- 0134_index_manquants.sql
-- ─────────────────────────────────────────────────────────

-- 0134 — Deux index sur des colonnes qui sont le chemin d'accès principal.
--
-- Constat (audit 2026-08-31, CAP-22) : deux colonnes très filtrées par le code
-- n'avaient aucun index.
--
-- `attendance_sheets(session_id)` — « les feuilles de cette séance » est la
-- lecture la plus fréquente du module émargement (7 sites). Seul `dossier_id`
-- était indexé ; or depuis la migration 0106, une feuille rattachée à une
-- session de groupe a `dossier_id NULL`. Pour ces sessions, l'index existant ne
-- sert à rien et la recherche parcourt la table.
--
-- `questionnaire_responses(assignment_id)` — « les réponses de cette
-- assignation » (10 sites). Seuls `dossier_id` et `template_id` étaient indexés.
--
-- Sans effet mesurable aujourd'hui — la base contient quelques dizaines de
-- lignes — mais ces deux lectures croissent avec le nombre de séances et de
-- questionnaires, c'est-à-dire avec l'activité de l'organisme.
--
-- Non retenus : `dossiers.status` et `documents.kind`, de faible cardinalité et
-- toujours filtrés avec `organization_id`, déjà indexé. Et
-- `session_participants(session_id)`, déjà servi par la première colonne de sa
-- clé primaire.

CREATE INDEX IF NOT EXISTS ix_attendance_sheets_session
  ON app.attendance_sheets(session_id);

CREATE INDEX IF NOT EXISTS ix_q_responses_assignment
  ON app.questionnaire_responses(assignment_id);

-- ─────────────────────────────────────────────────────────
-- 0135_indicateurs_declares.sql
-- ─────────────────────────────────────────────────────────

-- 0135 — Saisie manuelle des indicateurs de résultats.
--
-- Les indicateurs sont calculés depuis les dossiers terminés et les
-- questionnaires de satisfaction. Un organisme qui arrive sur Capsule a
-- pourtant déjà un historique — années précédentes, outil précédent — et la
-- fiche publique de ses formations ne peut pas rester vide en attendant que la
-- plateforme accumule des données. L'indicateur Qualiopi 2 exige des résultats
-- publiés.
--
-- Une déclaration porte sur une **année**, au niveau de l'organisme
-- (`formation_id IS NULL`) ou d'une formation précise. Chaque colonne est
-- optionnelle : on ne déclare que ce qu'on connaît, le reste continue d'être
-- calculé.
--
-- `source` est libre et obligatoire à la saisie côté application : en contrôle
-- Qualiopi, un chiffre déclaré doit pouvoir être rattaché à sa provenance
-- (« export Digiforma 2024 », « registre interne »).

CREATE TABLE app.declared_indicators (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id         UUID NOT NULL REFERENCES app.organizations(id) ON DELETE CASCADE,
  formation_id            UUID REFERENCES app.formations(id) ON DELETE CASCADE,
  year                    INT  NOT NULL CHECK (year BETWEEN 2000 AND 2100),

  learners_trained        INT     CHECK (learners_trained >= 0),
  satisfaction_rate       NUMERIC(5,2) CHECK (satisfaction_rate BETWEEN 0 AND 100),
  satisfaction_responses  INT     CHECK (satisfaction_responses >= 0),
  response_rate           NUMERIC(5,2) CHECK (response_rate BETWEEN 0 AND 100),
  formations_delivered    INT     CHECK (formations_delivered >= 0),

  source                  TEXT NOT NULL CHECK (length(btrim(source)) BETWEEN 1 AND 200),
  note                    TEXT CHECK (note IS NULL OR length(note) <= 1000),

  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by              UUID REFERENCES app.members(id) ON DELETE SET NULL
);

-- Une seule déclaration par périmètre. Deux index partiels, `formation_id`
-- pouvant être NULL — une contrainte UNIQUE ordinaire ne distinguerait pas les
-- lignes globales entre elles.
CREATE UNIQUE INDEX ux_declared_indicators_org_year
  ON app.declared_indicators(organization_id, year)
  WHERE formation_id IS NULL;

CREATE UNIQUE INDEX ux_declared_indicators_formation_year
  ON app.declared_indicators(organization_id, formation_id, year)
  WHERE formation_id IS NOT NULL;

CREATE INDEX ix_declared_indicators_org ON app.declared_indicators(organization_id, year);

ALTER TABLE app.declared_indicators ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.declared_indicators FORCE ROW LEVEL SECURITY;

CREATE POLICY declared_indicators_select ON app.declared_indicators FOR SELECT TO authenticated
USING (organization_id = app.current_organization_id());

CREATE POLICY declared_indicators_insert ON app.declared_indicators FOR INSERT TO authenticated
WITH CHECK (organization_id = app.current_organization_id() AND app.is_staff());

CREATE POLICY declared_indicators_update ON app.declared_indicators FOR UPDATE TO authenticated
USING (organization_id = app.current_organization_id() AND app.is_staff())
WITH CHECK (organization_id = app.current_organization_id() AND app.is_staff());

CREATE POLICY declared_indicators_delete ON app.declared_indicators FOR DELETE TO authenticated
USING (organization_id = app.current_organization_id() AND app.is_staff());

COMMENT ON TABLE app.declared_indicators IS
  'Indicateurs de résultats saisis à la main, par année et par formation. Complètent le calcul automatique (audit CAP-24).';

-- ── Fiche publique : les déclarations s'ajoutent au calcul ──────────────────
-- Une formation dont les résultats sont déclarés doit les afficher, sinon la
-- saisie manuelle ne servirait qu'en interne. Le contrat de retour est celui
-- posé en 0127 — mêmes clés, mêmes conditions de publication — enrichi de
-- `declared_source`, qui permet d'indiquer la provenance des chiffres déclarés.
-- Les apprenants et les réponses s'additionnent ; la satisfaction est une
-- moyenne pondérée par le nombre de réponses de chaque source.

CREATE OR REPLACE FUNCTION public.get_published_formation_indicators(p_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, app, public
AS $$
  WITH formation AS (
    SELECT f.id, f.organization_id
    FROM app.formations f
    JOIN app.organizations o ON o.id = f.organization_id
    WHERE f.id = p_id
      AND f.is_published = true
      AND f.deleted_at IS NULL
      AND o.status = 'active'
      AND o.deleted_at IS NULL
  ),
  trained AS (
    SELECT
      count(DISTINCT d.learner_id) AS learners,
      max(d.end_date) AS last_end_date
    FROM app.dossiers d
    JOIN formation f ON f.id = d.formation_id
    WHERE d.status IN ('completed', 'closed', 'archived')
      AND d.deleted_at IS NULL
  ),
  satisfaction AS (
    SELECT
      round(avg(r.score))::int AS rate,
      count(*)::int AS responses
    FROM app.questionnaire_responses r
    JOIN app.dossiers d ON d.id = r.dossier_id
    JOIN formation f ON f.id = d.formation_id
    JOIN app.questionnaire_templates t ON t.id = r.template_id
    WHERE t.kind IN ('satisfaction_chaud', 'satisfaction_froid')
      AND r.score IS NOT NULL
      AND d.deleted_at IS NULL
  ),
  declare AS (
    SELECT
      COALESCE(sum(di.learners_trained), 0)::int       AS learners,
      COALESCE(sum(di.satisfaction_responses), 0)::int AS responses,
      sum(di.satisfaction_rate * di.satisfaction_responses) AS points,
      string_agg(DISTINCT di.source, ' · ')            AS sources
    FROM app.declared_indicators di
    JOIN formation f ON f.id = di.formation_id AND f.organization_id = di.organization_id
  )
  SELECT jsonb_build_object(
    'learners', COALESCE(trained.learners, 0) + declare.learners,
    'satisfaction_rate',
      CASE
        WHEN COALESCE(satisfaction.responses, 0) + declare.responses = 0 THEN NULL
        ELSE round(
          (COALESCE(satisfaction.rate, 0)::numeric * COALESCE(satisfaction.responses, 0)
           + COALESCE(declare.points, 0))
          / (COALESCE(satisfaction.responses, 0) + declare.responses)
        )::int
      END,
    'satisfaction_responses', COALESCE(satisfaction.responses, 0) + declare.responses,
    'last_session_end', trained.last_end_date,
    'declared_source', declare.sources
  )
  FROM formation, trained, satisfaction, declare;
$$;

REVOKE ALL ON FUNCTION public.get_published_formation_indicators(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_published_formation_indicators(uuid) TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';

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
