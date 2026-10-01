-- Un tarif par stagiaire, ou un prix global pour la formation.
--
-- Demande d'Ismael le 2026-10-01. Le tarif d'une formation se lisait partout
-- comme un prix par stagiaire : un prix convenu pour tout le groupe ne
-- pouvait pas se dire, et le chiffre d'affaires prévisionnel le multipliait
-- par le nombre de participants.
--
-- 'par_stagiaire' par défaut : l'existant garde son sens, sans reprise.
ALTER TABLE app.prospects
  ADD COLUMN IF NOT EXISTS custom_formation_price_mode TEXT NOT NULL DEFAULT 'par_stagiaire'
  CHECK (custom_formation_price_mode IN ('par_stagiaire', 'forfait'));

COMMENT ON COLUMN app.prospects.custom_formation_price_mode IS
  'Sens de custom_formation_price_cents : prix par stagiaire, ou forfait pour toute la formation.';

ALTER TABLE app.formations
  ADD COLUMN IF NOT EXISTS price_mode TEXT NOT NULL DEFAULT 'par_stagiaire'
  CHECK (price_mode IN ('par_stagiaire', 'forfait'));

COMMENT ON COLUMN app.formations.price_mode IS
  'Sens de default_price_cents : prix par stagiaire, ou forfait pour toute la formation.';

NOTIFY pgrst, 'reload schema';
