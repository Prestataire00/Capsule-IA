-- ============================================================================
-- 0082 — Émargement par demi-journée : génération automatique des créneaux (F-EMA-01)
-- ============================================================================
-- Exigence financeurs (OPCO/FAF-CA/AGEFIPH) : une signature MATIN + une signature
-- APRÈS-MIDI, pas de feuille unique journée. Le schéma supporte déjà
-- attendance_sheets.half_day IN ('morning','afternoon','full','evening'), mais
-- seules des feuilles 'full' étaient créées à la demande. Ici on matérialise
-- automatiquement les feuilles matin/après-midi à partir des horaires de session.
--
-- Frontière midi = 13:00 (heure Europe/Paris). Une session couvre :
--   - le matin    si son début local est avant 13:00
--   - l'après-midi si sa fin   locale est après 13:00
-- (une session 9h-17h → 2 feuilles ; 14h-17h → après-midi seule ; 9h-12h → matin).
--
-- Garde-fou : si une feuille 'full' existe déjà pour la session (émargement
-- legacy / saisie manuelle en feuille unique, potentiellement déjà signée), on
-- NE mélange PAS les modèles → on laisse tel quel. La signature, la feuille PDF
-- et l'audit trail (IP/horodatage) existants opèrent ensuite par demi-journée.

CREATE OR REPLACE FUNCTION app.materialize_attendance_slots(p_session_id uuid)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, app
AS $$
DECLARE
  s          RECORD;
  v_start    time;
  v_end      time;
  v_boundary time := '13:00';
  v_created  int := 0;
BEGIN
  SELECT id, organization_id, dossier_id, starts_at, ends_at, status
    INTO s
    FROM app.sessions
   WHERE id = p_session_id;
  IF NOT FOUND THEN
    RETURN 0;
  END IF;

  -- Sessions annulées : pas de créneaux.
  IF s.status = 'cancelled' THEN
    RETURN 0;
  END IF;

  -- Ne pas mélanger avec un émargement en feuille unique déjà posé.
  IF EXISTS (
    SELECT 1 FROM app.attendance_sheets
     WHERE session_id = s.id AND half_day = 'full'
  ) THEN
    RETURN 0;
  END IF;

  v_start := (s.starts_at AT TIME ZONE 'Europe/Paris')::time;
  v_end   := (s.ends_at   AT TIME ZONE 'Europe/Paris')::time;

  -- Matin
  IF v_start < v_boundary THEN
    INSERT INTO app.attendance_sheets (organization_id, dossier_id, session_id, half_day, status)
    VALUES (s.organization_id, s.dossier_id, s.id, 'morning', 'open')
    ON CONFLICT (session_id, half_day) DO NOTHING;
    IF FOUND THEN v_created := v_created + 1; END IF;
  END IF;

  -- Après-midi
  IF v_end > v_boundary THEN
    INSERT INTO app.attendance_sheets (organization_id, dossier_id, session_id, half_day, status)
    VALUES (s.organization_id, s.dossier_id, s.id, 'afternoon', 'open')
    ON CONFLICT (session_id, half_day) DO NOTHING;
    IF FOUND THEN v_created := v_created + 1; END IF;
  END IF;

  -- Cas dégénéré (ni matin ni après-midi détecté, ex. créneau exactement à 13:00) :
  -- une feuille 'full' de repli, uniquement si la session n'a encore aucune feuille.
  IF v_created = 0 AND NOT EXISTS (SELECT 1 FROM app.attendance_sheets WHERE session_id = s.id) THEN
    INSERT INTO app.attendance_sheets (organization_id, dossier_id, session_id, half_day, status)
    VALUES (s.organization_id, s.dossier_id, s.id, 'full', 'open')
    ON CONFLICT (session_id, half_day) DO NOTHING;
  END IF;

  RETURN v_created;
END;
$$;

-- ---------------------------------------------------------------------------
-- Trigger : matérialise les créneaux à la création et à la (re)planification.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.tg_session_materialize_slots()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, app
AS $$
BEGIN
  PERFORM app.materialize_attendance_slots(NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tg_session_materialize_slots ON app.sessions;
CREATE TRIGGER tg_session_materialize_slots
AFTER INSERT OR UPDATE OF starts_at, ends_at ON app.sessions
FOR EACH ROW
EXECUTE FUNCTION app.tg_session_materialize_slots();

-- ---------------------------------------------------------------------------
-- Backfill : crée les créneaux demi-journée pour les sessions existantes
-- (hors annulées, et hors sessions déjà en feuille unique 'full').
-- ---------------------------------------------------------------------------
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT id FROM app.sessions WHERE status <> 'cancelled'
  LOOP
    PERFORM app.materialize_attendance_slots(r.id);
  END LOOP;
END;
$$;
