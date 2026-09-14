-- Disponibilités déclarées par les formateurs.
--
-- Planifier une séance revenait à deviner : l'administration choisissait un
-- formateur, puis découvrait par téléphone qu'il n'était pas libre. Le
-- formateur pose maintenant ses jours, et la disponibilité s'affiche au moment
-- où la séance se crée.
--
-- Trois créneaux suffisent — journée, matin, après-midi : personne ne déclare
-- ses indisponibilités au quart d'heure, et une séance tient dans une demi-journée
-- ou dans la journée.

CREATE TABLE IF NOT EXISTS app.trainer_availability (
  id               UUID        PRIMARY KEY DEFAULT uuidv7(),
  organization_id  UUID        NOT NULL REFERENCES app.organizations(id) ON DELETE CASCADE,
  trainer_id       UUID        NOT NULL REFERENCES app.trainers(id) ON DELETE CASCADE,
  day              DATE        NOT NULL,
  slot             TEXT        NOT NULL CHECK (slot IN ('journee', 'matin', 'apres_midi')),
  kind             TEXT        NOT NULL CHECK (kind IN ('disponible', 'indisponible')),
  -- « Congés », « autre mission », « uniquement en visio » : le motif évite un appel.
  note             TEXT        CHECK (note IS NULL OR length(note) <= 500),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Une déclaration par formateur, par jour et par créneau : re-déclarer
  -- remplace, cela n'empile pas des avis contradictoires.
  CONSTRAINT trainer_availability_unique UNIQUE (trainer_id, day, slot)
);

-- Vue de l'administration : « qui est libre ce jour-là ».
CREATE INDEX IF NOT EXISTS ix_trainer_availability_org_day
  ON app.trainer_availability (organization_id, day);
-- Vue du formateur : « mes prochaines semaines ».
CREATE INDEX IF NOT EXISTS ix_trainer_availability_trainer_day
  ON app.trainer_availability (trainer_id, day);

ALTER TABLE app.trainer_availability ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.trainer_availability FORCE ROW LEVEL SECURITY;

-- Lecture : l'organisation qui planifie, et le formateur pour ses propres jours
-- (un formateur externe n'est pas membre — d'où la seconde branche, 0150).
DROP POLICY IF EXISTS trainer_availability_select ON app.trainer_availability;
CREATE POLICY trainer_availability_select ON app.trainer_availability FOR SELECT TO authenticated
  USING (
    organization_id = app.current_organization_id()
    OR trainer_id IN (SELECT app.my_trainer_ids())
  );

-- Écriture : service role (les Server Actions gardent le compte et la fiche).
DROP POLICY IF EXISTS trainer_availability_write ON app.trainer_availability;
CREATE POLICY trainer_availability_write ON app.trainer_availability FOR ALL TO service_role
  USING (true) WITH CHECK (true);

COMMENT ON TABLE app.trainer_availability IS
  'Jours et demi-journées déclarés disponibles ou indisponibles par un formateur.';
