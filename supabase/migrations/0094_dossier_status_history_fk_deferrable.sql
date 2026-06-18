-- 0094_dossier_status_history_fk_deferrable.sql
-- Le trigger BEFORE INSERT `tg_dossier_transitions` (0015) insère une ligne dans
-- app.dossier_status_history avec NEW.id AVANT que la ligne app.dossiers existe.
-- Si la FK dossier_id n'est pas DEFERRABLE, la vérification immédiate échoue
-- (ERREUR 23503) → toute création de dossier est cassée. On rend la FK déférable
-- (vérifiée au COMMIT, quand le dossier existe).
ALTER TABLE app.dossier_status_history
  DROP CONSTRAINT IF EXISTS dossier_status_history_dossier_id_fkey;
ALTER TABLE app.dossier_status_history
  ADD CONSTRAINT dossier_status_history_dossier_id_fkey
    FOREIGN KEY (dossier_id) REFERENCES app.dossiers(id) ON DELETE CASCADE
    DEFERRABLE INITIALLY DEFERRED;
