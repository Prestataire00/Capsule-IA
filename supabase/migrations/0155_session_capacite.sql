-- 0155 — Séance : capacité maximale (onglet Informations façon RFC)
--
-- « Capacité : x / y participants (n places restantes) » : le nombre de places
-- de la séance, saisi par l'organisme. Facultatif : sans capacité, la fiche
-- affiche « Capacité non définie ».
--
-- Rejouable sans risque.

ALTER TABLE app.sessions
  ADD COLUMN IF NOT EXISTS capacity_max INT;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sessions_capacity_max_check') THEN
    ALTER TABLE app.sessions ADD CONSTRAINT sessions_capacity_max_check
      CHECK (capacity_max IS NULL OR capacity_max BETWEEN 1 AND 1000);
  END IF;
END $$;

COMMENT ON COLUMN app.sessions.capacity_max IS 'Nombre de places de la séance (0155).';

NOTIFY pgrst, 'reload schema';
