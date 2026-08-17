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
