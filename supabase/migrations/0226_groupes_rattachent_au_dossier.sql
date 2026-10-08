-- Un membre d'un groupe est stagiaire des dossiers dont il suit les séances
-- (constat d'Ismael le 2026-10-08 : Guilhem, coché dans le Groupe A de
-- Sandaya, n'était ni sur la feuille d'émargement ni dans les questionnaires
-- de fin du Groupe A).
--
-- Cause : pour une séance de groupe, les attendus sont les membres du groupe
-- QUI SONT AUSSI stagiaires d'un dossier de la séance (0195). Une personne
-- cochée dans le groupe mais seulement inscrite à une séance (ou passée par une
-- séance annulée) n'y figurait pas : invisible partout où le dossier fait foi
-- (émargement, questionnaires, documents, espace entreprise, heures).
--
-- Désormais, être membre d'un groupe vaut inscription aux dossiers de ses
-- séances : le groupe du dossier, et les dossiers des séances qui visent ce
-- groupe (groupe d'un client, partagé entre ses dossiers). Retirer quelqu'un
-- d'un groupe ne le retire pas du dossier : c'est une décision à part.

CREATE OR REPLACE FUNCTION app.rattacher_membres_groupe(p_groupe_id UUID, p_learner_id UUID DEFAULT NULL)
RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = app, pg_temp
AS $$
DECLARE
  v_ajouts INTEGER := 0;
  v_n INTEGER;
  r RECORD;
BEGIN
  FOR r IN
    WITH g AS (
      SELECT id, organization_id, dossier_id, company_id FROM app.dossier_groupes WHERE id = p_groupe_id
    ),
    cibles AS (
      SELECT g.dossier_id AS dossier_id FROM g WHERE g.dossier_id IS NOT NULL
      UNION
      SELECT sdi.dossier_id
      FROM app.sessions s
      CROSS JOIN LATERAL app.session_dossier_ids(s.id) sdi
      WHERE s.groupe_id = p_groupe_id AND s.status <> 'cancelled'
    )
    SELECT d.id AS dossier_id, d.organization_id, d.learner_id AS titulaire, d.holder_is_learner, m.learner_id
    FROM cibles c
    JOIN app.dossiers d ON d.id = c.dossier_id AND d.deleted_at IS NULL
    JOIN g ON g.organization_id = d.organization_id
    JOIN app.dossier_groupe_membres m ON m.groupe_id = p_groupe_id
    WHERE (p_learner_id IS NULL OR m.learner_id = p_learner_id)
      -- Un groupe d'un client ne touche que les dossiers de ce client.
      AND (g.company_id IS NULL OR d.company_id = g.company_id)
  LOOP
    -- Un dossier sans liste ne comptait que son titulaire (0175) : il le reste
    -- en entrant dans la liste, avant le nouveau membre.
    IF r.holder_is_learner IS NOT FALSE AND r.titulaire IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM app.dossier_learners dl WHERE dl.dossier_id = r.dossier_id) THEN
      INSERT INTO app.dossier_learners (dossier_id, learner_id, organization_id)
      VALUES (r.dossier_id, r.titulaire, r.organization_id)
      ON CONFLICT DO NOTHING;
    END IF;
    INSERT INTO app.dossier_learners (dossier_id, learner_id, organization_id)
    VALUES (r.dossier_id, r.learner_id, r.organization_id)
    ON CONFLICT DO NOTHING;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_ajouts := v_ajouts + v_n;
  END LOOP;
  RETURN v_ajouts;
END;
$$;

REVOKE ALL ON FUNCTION app.rattacher_membres_groupe(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.rattacher_membres_groupe(UUID, UUID) TO service_role;

-- Un membre entre dans un groupe.
CREATE OR REPLACE FUNCTION app.tg_membre_groupe_rattache()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = app, pg_temp AS $$
BEGIN
  PERFORM app.rattacher_membres_groupe(NEW.groupe_id, NEW.learner_id);
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS tg_membre_groupe_rattache ON app.dossier_groupe_membres;
CREATE TRIGGER tg_membre_groupe_rattache
  AFTER INSERT ON app.dossier_groupe_membres
  FOR EACH ROW EXECUTE FUNCTION app.tg_membre_groupe_rattache();

-- Une séance vise un groupe (à sa création ou ensuite).
CREATE OR REPLACE FUNCTION app.tg_seance_groupe_rattache()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = app, pg_temp AS $$
BEGIN
  IF NEW.groupe_id IS NOT NULL AND (TG_OP = 'INSERT' OR NEW.groupe_id IS DISTINCT FROM OLD.groupe_id OR NEW.dossier_id IS DISTINCT FROM OLD.dossier_id) THEN
    PERFORM app.rattacher_membres_groupe(NEW.groupe_id);
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS tg_seance_groupe_rattache ON app.sessions;
CREATE TRIGGER tg_seance_groupe_rattache
  AFTER INSERT OR UPDATE OF groupe_id, dossier_id ON app.sessions
  FOR EACH ROW EXECUTE FUNCTION app.tg_seance_groupe_rattache();

-- Une séance de groupe gagne un dossier (séance partagée).
CREATE OR REPLACE FUNCTION app.tg_seance_dossier_groupe_rattache()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = app, pg_temp AS $$
DECLARE v_groupe UUID;
BEGIN
  SELECT groupe_id INTO v_groupe FROM app.sessions WHERE id = NEW.session_id;
  IF v_groupe IS NOT NULL THEN
    PERFORM app.rattacher_membres_groupe(v_groupe);
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS tg_seance_dossier_groupe_rattache ON app.session_dossiers;
CREATE TRIGGER tg_seance_dossier_groupe_rattache
  AFTER INSERT ON app.session_dossiers
  FOR EACH ROW EXECUTE FUNCTION app.tg_seance_dossier_groupe_rattache();

-- Rattrapage : tous les groupes existants.
DO $$
DECLARE g RECORD;
BEGIN
  FOR g IN SELECT id FROM app.dossier_groupes LOOP
    PERFORM app.rattacher_membres_groupe(g.id);
  END LOOP;
END $$;
