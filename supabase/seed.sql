-- ============================================================================
-- Seed : référentiel Qualiopi (32 indicateurs) + templates système minimaux
-- ============================================================================

-- Référentiel des 32 indicateurs Qualiopi
INSERT INTO app.qualiopi_indicators (code, number, scope, criterion, title, description, expected_proofs) VALUES
  ('I1',  1,  'organization', 1, 'Information du public sur les prestations', 'Site web, plaquette, conditions générales', ARRAY['site_web','plaquette']),
  ('I2',  2,  'organization', 1, 'Information sur taux de réussite et indicateurs', 'Indicateurs publiés (réussite, satisfaction)', ARRAY['stats_publiees']),
  ('I3',  3,  'organization', 1, 'Présentation des modalités d''évaluation', 'Description évaluation accessible', ARRAY['catalogue']),
  ('I4',  4,  'dossier',      2, 'Identification des objectifs', 'Objectifs opérationnels et évaluables', ARRAY['programme']),
  ('I5',  5,  'dossier',      2, 'Adaptation du parcours', 'Adaptation aux objectifs et acquis', ARRAY['positionnement']),
  ('I6',  6,  'dossier',      2, 'Définition des modalités pédagogiques', 'Modalités explicites', ARRAY['programme']),
  ('I7',  7,  'dossier',      2, 'Programme détaillé', 'Programme par séquence', ARRAY['programme']),
  ('I8',  8,  'dossier',      2, 'Modalités d''évaluation', 'Évaluation prévue et tracée', ARRAY['evaluation']),
  ('I9',  9,  'dossier',      2, 'Adaptation pédagogique', 'Adaptation aux publics', ARRAY['adaptation_peda']),
  ('I10', 10, 'dossier',      2, 'Positionnement de l''apprenant', 'Questionnaire de positionnement complété', ARRAY['questionnaire_positionnement']),
  ('I11', 11, 'dossier',      3, 'Accueil des publics spécifiques', 'Adaptation handicap, RQTH', ARRAY['accueil_handicap']),
  ('I12', 12, 'dossier',      3, 'Accompagnement de l''apprenant', 'Suivi pédagogique formalisé', ARRAY['suivi']),
  ('I13', 13, 'dossier',      4, 'Conditions de déroulement', 'Conditions matérielles documentées', ARRAY['conditions']),
  ('I14', 14, 'dossier',      4, 'Coordination des acteurs', 'Communication interne tracée', ARRAY['coordination']),
  ('I15', 15, 'dossier',      4, 'Évaluation de l''atteinte des objectifs', 'Évaluation finale tracée', ARRAY['evaluation_finale']),
  ('I16', 16, 'organization', 5, 'Veille légale et réglementaire', 'Documents de veille', ARRAY['veille']),
  ('I17', 17, 'organization', 5, 'Veille pédagogique', 'Documents de veille', ARRAY['veille_peda']),
  ('I18', 18, 'organization', 5, 'Veille emploi/métiers', 'Documents de veille', ARRAY['veille_metiers']),
  ('I19', 19, 'organization', 5, 'Innovation pédagogique', 'Initiatives documentées', ARRAY['innovation']),
  ('I20', 20, 'dossier',      6, 'Locaux et matériel', 'Conformité ERP, accessibilité', ARRAY['locaux']),
  ('I21', 21, 'dossier',      6, 'Compétences des formateurs', 'CV, diplômes, expériences', ARRAY['cv','diplomes']),
  ('I22', 22, 'dossier',      6, 'Traçabilité des présences', 'Émargements signés', ARRAY['emargements']),
  ('I23', 23, 'dossier',      6, 'Évaluation des acquis', 'Évaluation tracée', ARRAY['evaluation']),
  ('I24', 24, 'organization', 6, 'Sous-traitance', 'Contrats sous-traitance', ARRAY['contrats']),
  ('I25', 25, 'organization', 6, 'Partenariats', 'Conventions partenaires', ARRAY['conventions']),
  ('I26', 26, 'dossier',      7, 'Recueil satisfaction à chaud', 'Questionnaire satisfaction immédiat', ARRAY['questionnaire_chaud']),
  ('I27', 27, 'dossier',      7, 'Recueil satisfaction à froid', 'Questionnaire satisfaction différé', ARRAY['questionnaire_froid']),
  ('I28', 28, 'organization', 7, 'Évaluation par les financeurs', 'Évaluation prescripteurs', ARRAY['evaluation_financeurs']),
  ('I29', 29, 'organization', 7, 'Indicateurs de performance', 'Tableaux de bord', ARRAY['kpis']),
  ('I30', 30, 'dossier',      7, 'Identification des dysfonctionnements', 'Suivi des aléas', ARRAY['suivi_alea']),
  ('I31', 31, 'organization', 7, 'Recueil et traitement des réclamations', 'Procédure et tracking réclamations', ARRAY['procedure_reclamations']),
  ('I32', 32, 'organization', 7, 'Amélioration continue', 'Plan d''action et revue', ARRAY['plan_action'])
ON CONFLICT (code) DO NOTHING;
