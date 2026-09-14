-- Séance « libre » : planifier pour un client sans passer par une formation ni
-- un dossier. `sessions.dossier_id` et `sessions.formation_id` sont déjà
-- nullables (0106) ; il manquait le client, jusqu'ici déduit des dossiers
-- rattachés — donc introuvable pour une séance qui n'en a aucun.
--
-- Un particulier reste porté par ses participants ; cette colonne nomme
-- l'entreprise cliente (intra, sur mesure, prestation ponctuelle).

ALTER TABLE app.sessions
  ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES app.companies(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS ix_sessions_company
  ON app.sessions (company_id) WHERE company_id IS NOT NULL;

COMMENT ON COLUMN app.sessions.company_id IS
  'Entreprise cliente d''une séance planifiée sans formation ni dossier (NULL sinon : le client vient des dossiers rattachés).';
