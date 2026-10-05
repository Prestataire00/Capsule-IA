-- ============================================================================
-- 0208 — Grille tarifaire de l'organisme, modifiable dans les paramètres
-- ============================================================================
-- Tarif horaire par stagiaire dégressif et plancher par heure de séance
-- (grille d'Anissa, 05/10/2026). Appliquée par défaut aux devis, conventions,
-- demandes et propositions quand aucun prix n'a été saisi ; un prix saisi
-- l'emporte toujours. NULL = la grille de départ livrée avec la plateforme.
-- Forme : { tarifStandardCents, plancherHoraireCents,
--           paliers: [{ aPartirDe, tarifHoraireCents }], coutFormateurHoraireCents }
-- Écriture : Paramètres → Tarifs, propriétaires et administrateurs (RLS
-- existante sur app.organizations, action serveur gardée).
-- ============================================================================

ALTER TABLE app.organizations
  ADD COLUMN IF NOT EXISTS grille_tarifaire JSONB
    CHECK (grille_tarifaire IS NULL OR jsonb_typeof(grille_tarifaire) = 'object');

COMMENT ON COLUMN app.organizations.grille_tarifaire IS
  'Grille tarifaire par défaut (0208). NULL = grille de départ.';
