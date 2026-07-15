-- ============================================================================
-- 0116 — Identité de l'organisme Capsule IA (cachet auto dans les documents)
-- ============================================================================
-- Re-home idempotent d'un DDL appliqué en prod hors-lignée (ancienne version
-- 0108, réputée « revertée » dans l'historique mais dont les effets persistent
-- en base). Ce fichier redevient la source de vérité : no-op sur prod (valeurs
-- déjà en place), applique sur une base neuve.
--
-- Renseigne raison sociale, adresse et SIRET de l'OF afin que le cachet texte
-- apposé automatiquement dans la zone de signature des documents (certificat,
-- convention, attestation, facture) reflète l'identité réelle de Capsule IA.
--
-- Cible : l'organisation par défaut seedée en 0027 (slug 'acme-of'), OU l'unique
-- organisation présente. Ne touche jamais une autre OF réelle dans un déploiement
-- multi-organisations. Idempotent.
-- ============================================================================

UPDATE app.organizations
SET
  name       = 'Capsule IA',
  legal_name = 'Capsule IA',
  siret      = '98953111600014',
  address    = COALESCE(address, '{}'::jsonb) || jsonb_build_object(
    'line1',       '25 rue Romain Rolland',
    'postal_code', '45100',
    'city',        'Orléans',
    'country',     'France'
  ),
  updated_at = now()
WHERE slug = 'acme-of'
   OR (SELECT count(*) FROM app.organizations) = 1;
