-- 0097_prospect_needs_analysis.sql
-- Fiche besoin (analyse des besoins) saisie EN LIGNE dans le formulaire
-- d'inscription. Stockée directement sur le prospect (avant tout learner/dossier).
-- Chaque salarié d'une inscription entreprise = un prospect → sa propre fiche.
-- RLS inchangée (la colonne suit la table prospects, déjà protégée).

ALTER TABLE app.prospects
  ADD COLUMN IF NOT EXISTS needs_analysis JSONB;
