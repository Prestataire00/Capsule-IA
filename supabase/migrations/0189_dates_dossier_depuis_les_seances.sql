-- Les dates d'un dossier suivent ses séances.
--
-- Un dossier né d'une demande recevait `end_date = start_date` : la demande ne
-- recueille pas de date de fin, et rien ne la corrigeait ensuite. Une formation
-- de cinq jours naissait donc sur un seul, ce qui fausse le suivi des heures,
-- les documents, et surtout avance les envois de fin de formation — le
-- questionnaire de satisfaction partait quatre jours avant la fin réelle.
--
-- La vérité est dans les séances : c'est là qu'on dit quand la formation a
-- lieu. Les dates du dossier en découlent désormais, quel que soit le chemin
-- par lequel la séance est créée. Un trigger plutôt qu'un appel applicatif :
-- les séances s'écrivent depuis l'assistant dossier, la fiche formation, la
-- création de séance de groupe et l'import de convention — en oublier un
-- laisserait des dossiers faux sans que rien ne le dise.
--
-- Deux rattachements coexistent (0052) : `sessions.dossier_id` et la table de
-- liaison `session_dossiers`. Les deux comptent.

CREATE OR REPLACE FUNCTION app.recalculer_dates_dossier(p_dossier_id UUID)
RETURNS VOID
LANGUAGE plpgsql
-- SECURITY DEFINER : le trigger doit écrire sur app.dossiers, dont la RLS est
-- forcée. Sans cela, planifier une séance échouerait pour tout le monde sauf
-- le service role. `search_path` figé — une fonction DEFINER sans search_path
-- est détournable.
SECURITY DEFINER
SET search_path = app, pg_catalog
AS $$
DECLARE
  v_debut DATE;
  v_fin   DATE;
BEGIN
  IF p_dossier_id IS NULL THEN
    RETURN;
  END IF;

  SELECT
    MIN((s.starts_at AT TIME ZONE 'Europe/Paris')::date),
    MAX((s.ends_at   AT TIME ZONE 'Europe/Paris')::date)
    INTO v_debut, v_fin
  FROM app.sessions s
  WHERE s.status <> 'cancelled'
    AND (
      s.dossier_id = p_dossier_id
      OR EXISTS (
        SELECT 1 FROM app.session_dossiers sd
        WHERE sd.session_id = s.id AND sd.dossier_id = p_dossier_id
      )
    );

  -- Aucune séance : on ne touche à rien. Les dates saisies à la main restent,
  -- et les colonnes sont NOT NULL — les effacer casserait le dossier.
  IF v_debut IS NULL OR v_fin IS NULL THEN
    RETURN;
  END IF;

  UPDATE app.dossiers d
     SET start_date = v_debut,
         end_date   = GREATEST(v_fin, v_debut),
         updated_at = now()
   WHERE d.id = p_dossier_id
     AND (d.start_date IS DISTINCT FROM v_debut OR d.end_date IS DISTINCT FROM GREATEST(v_fin, v_debut));
END;
$$;

COMMENT ON FUNCTION app.recalculer_dates_dossier(UUID) IS
  'Aligne dossiers.start_date / end_date sur les séances non annulées du dossier.';

-- Depuis une séance : sa création, son déplacement, son annulation, sa
-- suppression, et le changement de dossier auquel elle est rattachée.
CREATE OR REPLACE FUNCTION app.tg_dates_dossier_depuis_session()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, pg_catalog
AS $$
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') AND OLD.dossier_id IS NOT NULL THEN
    PERFORM app.recalculer_dates_dossier(OLD.dossier_id);
  END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') AND NEW.dossier_id IS NOT NULL THEN
    PERFORM app.recalculer_dates_dossier(NEW.dossier_id);
  END IF;

  -- Séance de groupe : elle sert plusieurs dossiers par la table de liaison.
  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    PERFORM app.recalculer_dates_dossier(sd.dossier_id)
       FROM app.session_dossiers sd
      WHERE sd.session_id = NEW.id;
  ELSE
    PERFORM app.recalculer_dates_dossier(sd.dossier_id)
       FROM app.session_dossiers sd
      WHERE sd.session_id = OLD.id;
  END IF;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS tg_dates_dossier_depuis_session ON app.sessions;
CREATE TRIGGER tg_dates_dossier_depuis_session
AFTER INSERT OR DELETE OR UPDATE OF starts_at, ends_at, status, dossier_id ON app.sessions
FOR EACH ROW EXECUTE FUNCTION app.tg_dates_dossier_depuis_session();

-- Depuis la liaison : rattacher ou détacher une séance de groupe change les
-- dates du dossier concerné.
CREATE OR REPLACE FUNCTION app.tg_dates_dossier_depuis_liaison()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, pg_catalog
AS $$
BEGIN
  PERFORM app.recalculer_dates_dossier(COALESCE(NEW.dossier_id, OLD.dossier_id));
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS tg_dates_dossier_depuis_liaison ON app.session_dossiers;
CREATE TRIGGER tg_dates_dossier_depuis_liaison
AFTER INSERT OR DELETE ON app.session_dossiers
FOR EACH ROW EXECUTE FUNCTION app.tg_dates_dossier_depuis_liaison();

-- Rattrapage : les dossiers déjà créés portent encore leurs dates provisoires.
-- Seuls ceux qui ont des séances sont touchés.
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT DISTINCT d.id
      FROM app.dossiers d
     WHERE EXISTS (SELECT 1 FROM app.sessions s WHERE s.dossier_id = d.id AND s.status <> 'cancelled')
        OR EXISTS (SELECT 1 FROM app.session_dossiers sd WHERE sd.dossier_id = d.id)
  LOOP
    PERFORM app.recalculer_dates_dossier(r.id);
  END LOOP;
END;
$$;
