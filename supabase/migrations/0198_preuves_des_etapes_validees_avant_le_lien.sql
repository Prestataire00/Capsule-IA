-- Rattrapage : les étapes validées à la main AVANT que la validation dépose
-- une preuve Qualiopi (494a65b, 25/09/2026 18h) n'en ont jamais reçu.
--
-- Constat du 27/09/2026 : un dossier avait « Analyse du besoin » et
-- « Formation réalisée » validées à la main à 14h07 le 25/09 — quatre heures
-- avant le lien. L'avancement les disait faites, l'onglet Qualiopi réclamait
-- toujours le positionnement et l'émargement. Zéro preuve en base.
--
-- On dépose ce que la validation aurait déposé, à l'identique de
-- `avancement-actions.ts` : mêmes indicateurs (needs → 4 et 8, done → 12),
-- sur chaque référentiel actif hors « legacy », même titre, même description,
-- même marquage `metadata`, pour que « retirer la validation » les retire
-- aussi. Rejouable : une preuve déjà posée pour (dossier, étape, indicateur)
-- n'est pas dupliquée. Le déclencheur 0143 recalcule la conformité.

WITH correspondance(step_key, numero, libelle) AS (
  VALUES ('needs', 4, 'Analyse du besoin'),
         ('needs', 8, 'Analyse du besoin'),
         ('done', 12, 'Formation réalisée')
)
INSERT INTO app.qualiopi_proofs (organization_id, indicator_id, scope, dossier_id, title, description, metadata, created_by)
SELECT o.organization_id,
       i.id,
       'dossier',
       o.dossier_id,
       c.libelle || ' — validée à la main',
       CASE
         WHEN btrim(coalesce(o.note, '')) <> ''
           THEN btrim(o.note) || ' (validé à la main le ' || to_char(o.validated_at AT TIME ZONE 'Europe/Paris', 'DD/MM/YYYY') || ', hors application.)'
         ELSE 'Étape déclarée réalisée hors de l''application, le ' || to_char(o.validated_at AT TIME ZONE 'Europe/Paris', 'DD/MM/YYYY') || '. Aucun motif n''a été précisé.'
       END,
       jsonb_build_object('source', 'avancement_manuel', 'step_key', o.step_key),
       o.validated_by
  FROM app.dossier_progress_overrides o
  JOIN correspondance c ON c.step_key = o.step_key
  JOIN app.qualiopi_indicators i
    ON i.number = c.numero
   AND i.scope = 'dossier'
   AND i.is_active
   AND i.referential_version <> 'legacy'
  JOIN app.dossiers d ON d.id = o.dossier_id
 WHERE NOT EXISTS (
         SELECT 1
           FROM app.qualiopi_proofs p
          WHERE p.dossier_id = o.dossier_id
            AND p.indicator_id = i.id
            AND p.metadata @> jsonb_build_object('source', 'avancement_manuel', 'step_key', o.step_key)
       );
