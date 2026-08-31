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
