-- 0173 — Espace formateur : le client et son référent deviennent lisibles
--
-- Constat : la page « Dossiers confiés » affichait « Stagiaires à désigner » en
-- guise de client et « Aucun référent désigné », alors que le dossier porte
-- bien FRANCE METIERS et M. DAHAN. La 0150 a ouvert au formateur les séances,
-- dossiers, apprenants et formations, mais jamais `app.companies` ni
-- `app.contacts` : leurs seules politiques (0019) exigent `app.is_staff()`, ce
-- qu'un formateur externe n'est pas. Les requêtes revenaient vides, sans
-- erreur, et l'écran tombait sur ses libellés de repli.
--
-- Or c'est précisément ce que le formateur doit avoir pour travailler : chez
-- qui il intervient, et qui appeler sur place. On lui ouvre donc ces deux
-- tables, restreintes aux seules lignes de ses dossiers :
--   · l'entreprise cliente de ses dossiers,
--   · le contact désigné référent de ses dossiers (`dossiers.contact_id`, 0167).
--
-- Rien d'autre du CRM : ni les autres entreprises, ni les autres contacts de
-- l'entreprise, ni quoi que ce soit de financier. Les politiques s'additionnent
-- à celles de la 0019, qui ne changent pas.
--
-- Rejouable sans risque.

-- ── 1. Fonctions « mes … » ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION app.my_trainer_company_ids()
RETURNS SETOF UUID LANGUAGE sql STABLE SECURITY DEFINER SET search_path = app, public AS $$
  SELECT d.company_id FROM app.dossiers d
   WHERE d.company_id IS NOT NULL
     AND d.deleted_at IS NULL
     AND d.id IN (SELECT app.my_trainer_dossier_ids())
$$;

COMMENT ON FUNCTION app.my_trainer_company_ids() IS
  'Entreprises clientes des dossiers confiés au formateur connecté. Sert la politique de lecture companies_formateur_espace.';

CREATE OR REPLACE FUNCTION app.my_trainer_contact_ids()
RETURNS SETOF UUID LANGUAGE sql STABLE SECURITY DEFINER SET search_path = app, public AS $$
  SELECT d.contact_id FROM app.dossiers d
   WHERE d.contact_id IS NOT NULL
     AND d.deleted_at IS NULL
     AND d.id IN (SELECT app.my_trainer_dossier_ids())
$$;

COMMENT ON FUNCTION app.my_trainer_contact_ids() IS
  'Référents désignés sur les dossiers confiés au formateur connecté — son interlocuteur chez le client, et lui seul.';

-- ── 2. Lecture : l'entreprise cliente et le référent du dossier ─────────────
DROP POLICY IF EXISTS companies_formateur_espace ON app.companies;
CREATE POLICY companies_formateur_espace ON app.companies
  FOR SELECT TO authenticated
  USING (deleted_at IS NULL AND id IN (SELECT app.my_trainer_company_ids()));

DROP POLICY IF EXISTS contacts_formateur_espace ON app.contacts;
CREATE POLICY contacts_formateur_espace ON app.contacts
  FOR SELECT TO authenticated
  USING (deleted_at IS NULL AND id IN (SELECT app.my_trainer_contact_ids()));
