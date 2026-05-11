-- ============================================================================
-- 0026 — Seed une organisation par défaut (idempotent)
-- ============================================================================
-- Permet aux features publiques (prospects, réclamations apprenants…) de
-- s'attacher à une org valide tant que le user n'a pas créé sa vraie OF.
-- Idempotent : ne fait rien si une org existe déjà.
-- ============================================================================

INSERT INTO app.organizations (
  slug, name, legal_name, contact_email,
  declaration_activite, qualiopi_certified_at
)
SELECT
  'acme-of', 'Acme Formation', 'Acme Formation SAS',
  'contact@acme-of.fr',
  '11 75 12345 75', '2024-03-15'::date
WHERE NOT EXISTS (SELECT 1 FROM app.organizations);
