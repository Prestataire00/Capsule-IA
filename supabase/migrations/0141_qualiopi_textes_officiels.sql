-- 0141 — Qualiopi : textes officiels du référentiel national qualité (RNQ V9)
--
-- 0139 a posé la numérotation officielle, sans le texte des indicateurs : la
-- page qualité affichait un emplacement vide. On renseigne ici, pour les 32
-- indicateurs V9 :
--  · l'exigence officielle, telle que publiée en annexe du décret n° 2019-565
--    du 6 juin 2019 (JORF n° 0132 du 8 juin 2019) ;
--  · des exemples de preuves, repris du guide de lecture V9 (DGEFP, 8 janvier 2024) ;
--  · l'applicabilité par catégorie d'action (L. 6313-1, 1° à 4°), lue dans le
--    tableau de l'annexe : 28 indicateurs pour la formation, 22 pour le bilan
--    de compétences, 24 pour la VAE, 32 pour l'apprentissage.
--
-- Catégories Capsule : formation = action_formation, formation_continue,
-- formation_initiale ; bilan = bilan_competences ; vae ; apprentissage.
-- Un dossier sans catégorie est traité comme une action de formation (il
-- l'était déjà de fait : tous les indicateurs communs s'y appliquaient).
--
-- Indicateur 12 : le guide V9 le réserve aux formations de plus de 2 jours,
-- le tableau officiel l'applique aux quatre catégories — on suit le tableau.
-- Indicateur 13 (alternance) : réservé à l'apprentissage, faute de distinguer
-- les contrats de professionnalisation dans Capsule.
--
-- Rejouable : simples UPDATE sur les lignes V9, puis recalcul des check-lists.

-- ── 1. Textes, preuves et applicabilité ─────────────────────────────────────
UPDATE app.qualiopi_indicators i
SET requirement       = v.requirement,
    expected_proofs   = v.expected_proofs,
    applies_to        = v.applies_to,
    certifying_only   = v.certifying_only,
    new_entrant       = v.new_entrant,
    minor_nc_possible = v.minor_nc_possible
FROM (VALUES
  (1, 'Le prestataire diffuse une information accessible au public, détaillée et vérifiable sur les prestations proposées : prérequis, objectifs, durée, modalités et délais d''accès, tarifs, contacts, méthodes mobilisées et modalités d''évaluation, accessibilité aux personnes handicapées.',
   ARRAY['Tous supports et outils d''information (plaquette, réseaux sociaux, sites internet, supports de publicité, salons)', 'Supports de contractualisation, conditions générales de vente', 'Pour les PSH : supports de présentation de la politique d''accessibilité, conditions d''accès', 'CBC : tout support rappelant le cadre légal et réglementaire du bilan, ses objectifs, son financement']::text[],
   NULL, false, false, true),
  (2, 'Le prestataire diffuse des indicateurs de résultats adaptés à la nature des prestations mises en œuvre et des publics accueillis.',
   ARRAY['Rapports d''activités, bilans, résultats d''enquêtes, indicateurs de performance', 'Indicateurs par formation : taux de satisfaction, nombre de stagiaires, taux et causes des abandons, taux d''insertion dans l''emploi', 'CFA : indicateurs de l''article L. 6111-8 (diffusion InserJeunes)', 'VAE : nombre de candidats accompagnés, taux de réussite']::text[],
   NULL, false, true, true),
  (3, 'Lorsque le prestataire met en œuvre des prestations conduisant à une certification professionnelle, il informe sur les taux d''obtention des certifications préparées, les possibilités de valider un/ou des blocs de compétences, ainsi que sur les équivalences, passerelles, suites de parcours et les débouchés.',
   ARRAY['Supports d''information (plaquette, réseaux sociaux, site internet, supports de contractualisation)', 'Taux d''obtention de la certification (mis en relation avec le taux de présentation à l''examen)', 'Trajectoires d''évolution des bénéficiaires à l''issue de la prestation', 'Information sur les débouchés : taux d''insertion global et dans le métier visé (fiche RNCP)']::text[],
   ARRAY['action_formation', 'formation_continue', 'formation_initiale', 'vae', 'apprentissage']::text[], true, true, true),
  (4, 'Le prestataire analyse le besoin du bénéficiaire en lien avec l''entreprise et/ou le financeur concerné(s).',
   ARRAY['Grilles d''analyse, diagnostics préalables', 'Dossiers d''admission, comptes rendus d''entretiens', 'Critères de détermination de l''opportunité et de la faisabilité de la prestation', 'VAE : contractualisation de l''accompagnement (méthode, modalités, échéancier)']::text[],
   NULL, false, false, false),
  (5, 'Le prestataire définit les objectifs opérationnels et évaluables de la prestation.',
   ARRAY['Identification des compétences visées par la prestation', 'Objectifs pédagogiques intermédiaires et finaux', 'Indicateurs de suivi et de résultats, supports de contractualisation', 'Référentiel de la certification', 'VAE : fiches de travail, programme de travail avec durées prévues']::text[],
   NULL, false, false, false),
  (6, 'Le prestataire établit les contenus et les modalités de mise en œuvre de la prestation, adaptés aux objectifs définis et aux publics bénéficiaires.',
   ARRAY['Parcours, déroulés et séquences', 'Grilles et modalités d''évaluation', 'Modalités techniques et pédagogiques (présentiel, distance, mixte)', 'Guide pratique du déroulé de la prestation avec durée et calendrier', 'PSH : accessibilité ou possibilités d''adaptation des modalités']::text[],
   NULL, false, false, false),
  (7, 'Lorsque le prestataire met en œuvre des prestations conduisant à une certification professionnelle, il s''assure de l''adéquation du ou des contenus de la prestation aux exigences de la certification visée.',
   ARRAY['Offre de formation présentée en cohérence avec le référentiel de la certification', 'Habilitation à former ou convention de partenariat avec le certificateur', 'Tableau croisé contenu de la formation / référentiel de compétences']::text[],
   ARRAY['action_formation', 'formation_continue', 'formation_initiale', 'apprentissage']::text[], true, false, false),
  (8, 'Le prestataire détermine les procédures de positionnement et d''évaluation des acquis à l''entrée de la prestation.',
   ARRAY['Diagnostic préalable, entretien', 'Évaluation des acquis à l''entrée (quiz, QCM, exercices, mise en situation, test)', 'Outils de mesure des écarts de compétences, auto-positionnement', 'Procédures de positionnement et/ou conditions d''accès']::text[],
   ARRAY['action_formation', 'formation_continue', 'formation_initiale', 'apprentissage']::text[], false, false, true),
  (9, 'Le prestataire informe les publics bénéficiaires sur les conditions de déroulement de la prestation.',
   ARRAY['Règlement intérieur, livret d''accueil, convocation', 'Noms des référents pédagogiques et administratifs, organigramme', 'Aspects périphériques (hébergement, restauration, transport, rémunération)', 'FOAD : modalités d''accès au LMS, assistance technique et pédagogique']::text[],
   NULL, false, false, true),
  (10, 'Le prestataire met en œuvre et adapte la prestation, l''accompagnement et le suivi aux publics bénéficiaires.',
   ARRAY['Durées et contenus, emplois du temps, groupes de niveaux', 'Livret de suivi pédagogique (centre/entreprise), référent pédagogique', 'Traçabilité de l''accompagnement technique et pédagogique', 'PSH : plans individuels de compensation du handicap, structures ressources', 'CFA : accompagnement dans la recherche d''un employeur']::text[],
   NULL, false, false, false),
  (11, 'Le prestataire évalue l''atteinte par les publics bénéficiaires des objectifs de la prestation.',
   ARRAY['Outils d''évaluation des acquis en cours et en fin de prestation (à chaud et à froid)', 'Outils d''auto-évaluation, bilans intermédiaires, comptes rendus', 'Taux de réussite aux certifications, preuve de délivrance de la certification', 'Livret de compétences, livrets de suivi en entreprise', 'VAE : dossier de suivi du candidat']::text[],
   NULL, false, true, false),
  (12, 'Le prestataire décrit et met en œuvre les mesures pour favoriser l''engagement des bénéficiaires et prévenir les ruptures de parcours.',
   ARRAY['Procédure de gestion des abandons et de relance systématique', 'Listing de relances téléphoniques, carnet de rendez-vous', 'Outils et méthodes favorisant l''implication (documents co-construits, espaces partagés)', 'Alternance : contacts/visites avec l''entreprise, rencontres formateurs/tuteurs/maîtres d''apprentissage']::text[],
   NULL, false, false, true),
  (13, 'Pour les formations en alternance, le prestataire, en lien avec l''entreprise, anticipe avec l''apprenant les missions confiées, à court, moyen et long terme, et assure la coordination et la progressivité des apprentissages réalisés en centre de formation et en entreprise.',
   ARRAY['Outil de liaison entreprise/bénéficiaire/prestataire (carnet de suivi)', 'Preuves de dialogue entre prestataire et tuteurs', 'Plannings, comptes rendus d''entretien ou de visite d''entreprise', 'Tableau de bord dématérialisé, capitalisation des retours d''expérience', 'PSH : outil de liaison sur les adaptations en entreprise']::text[],
   ARRAY['apprentissage']::text[], false, true, true),
  (14, 'Le prestataire met en œuvre un accompagnement socio-professionnel, éducatif et relatif à l''exercice de la citoyenneté.',
   ARRAY['Projets d''activités sportives, ateliers culturels, éducation aux écrans et à la citoyenneté', 'Dispositifs d''aides financières', 'Liste des intervenants sociaux', 'Accompagnement des apprenants dans le centre (restauration, foyer, internat)', 'Actions de sensibilisation à la mixité et à la diversité']::text[],
   ARRAY['apprentissage']::text[], false, true, false),
  (15, 'Le prestataire informe les apprentis de leurs droits et devoirs en tant qu''apprentis et salariés ainsi que des règles applicables en matière de santé et de sécurité en milieu professionnel.',
   ARRAY['Règlement intérieur du CFA', 'Supports d''information, livret d''accueil', 'Supports de contractualisation', 'Comptes rendus de réunions d''informations collectives']::text[],
   ARRAY['apprentissage']::text[], false, false, false),
  (16, 'Lorsque le prestataire met en œuvre des formations conduisant à une certification professionnelle, il s''assure que les conditions de présentation des bénéficiaires à la certification respectent les exigences formelles de l''autorité de certification.',
   ARRAY['Information des bénéficiaires sur le déroulement de l''évaluation, preuve d''inscription à la session', 'Habilitation à évaluer, convention de partenariat avec le certificateur', 'Référentiel d''évaluation, règlement d''organisation des examens, PV des sessions', 'PSH : modalités d''aménagement des examens']::text[],
   ARRAY['action_formation', 'formation_continue', 'formation_initiale', 'vae', 'apprentissage']::text[], true, false, false),
  (17, 'Le prestataire met à disposition ou s''assure de la mise à disposition des moyens humains et techniques adaptés et d''un environnement approprié (conditions, locaux, équipements, plateaux techniques…).',
   ARRAY['Bail ou contrat de location, registre public d''accessibilité', 'Document unique d''évaluation des risques professionnels', 'Matériel adéquat, plateaux techniques, plateformes LMS', 'CV, planning d''intervention, contrats de sous-traitance ou de prestations']::text[],
   NULL, false, false, true),
  (18, 'Le prestataire mobilise et coordonne les différents intervenants internes et/ou externes (pédagogiques, administratifs, logistiques, commerciaux…).',
   ARRAY['Organigramme fonctionnel avec champs d''intervention', 'Liste des intervenants internes/externes, contrats de travail ou de prestation', 'Fiches de poste, liste des référents pédagogiques, administratifs et handicap', 'Planning des intervenants, comptes rendus de réunions d''équipes']::text[],
   NULL, false, false, true),
  (19, 'Le prestataire met à disposition du bénéficiaire des ressources pédagogiques et permet à celui-ci de se les approprier.',
   ARRAY['Supports de cours, vidéos, fiches pratiques', 'Liste des ressources documentaires (fiches RNCP…)', 'Modalités d''accès aux ressources (présentiel, distance, espace partagé)', 'Traçabilité de l''accompagnement pédagogique à distance (forum, mails)', 'Dispositif de veille et d''actualisation des ressources']::text[],
   NULL, false, true, true),
  (20, 'Le prestataire dispose d''un personnel dédié à l''appui à la mobilité nationale et internationale, d''un référent handicap et d''un conseil de perfectionnement.',
   ARRAY['Nom et qualité des membres du conseil de perfectionnement, dernier compte rendu/PV', 'Nom et qualité des personnes dédiées à la mobilité', 'Nom du référent handicap et PV de sa nomination', 'Missions remplies et exemples d''actions menées']::text[],
   ARRAY['apprentissage']::text[], false, false, false),
  (21, 'Le prestataire détermine, mobilise et évalue les compétences des différents intervenants internes et/ou externes, adaptées aux prestations.',
   ARRAY['Analyse des besoins de compétences et modalités de recrutement', 'CV des intervenants, formations initiales et continues', 'Entretiens professionnels, processus d''intégration', 'Sensibilisation des personnels à l''accueil des PSH', 'CBC : certifications détenues pour les tests psychotechniques']::text[],
   NULL, false, false, false),
  (22, 'Le prestataire entretient et développe les compétences de ses salariés, adaptées aux prestations qu''il délivre.',
   ARRAY['Plan de développement des compétences', 'Entretiens professionnels', 'Groupes d''analyse et d''échange de pratiques, communauté de pairs', 'Information sur les possibilités de formation (CPF, VAE)']::text[],
   NULL, false, true, false),
  (23, 'Le prestataire réalise une veille légale et réglementaire sur le champ de la formation professionnelle et en exploite les enseignements.',
   ARRAY['Abonnements, adhésions, participation à des salons, conférences, groupes normatifs', 'Veille réglementaire en matière de handicap', 'Actualisation des supports d''information et de contractualisation (règles CPF)', 'Diffusion des actualités légales et réglementaires au personnel']::text[],
   NULL, false, false, true),
  (24, 'Le prestataire réalise une veille sur les évolutions des compétences, des métiers et des emplois dans ses secteurs d''intervention et en exploite les enseignements.',
   ARRAY['Veille sur les évolutions des compétences, métiers et emplois', 'Participation à des conférences, colloques, salons', 'Adhésion à un réseau professionnel, abonnements à des revues', 'Diffusion au personnel et évolutions apportées aux prestations']::text[],
   NULL, false, true, true),
  (25, 'Le prestataire réalise une veille sur les innovations pédagogiques et technologiques permettant une évolution de ses prestations et en exploite les enseignements.',
   ARRAY['Veille sur les innovations pédagogiques et technologiques', 'Participation à des conférences, groupes de réflexion et d''analyse de pratiques', 'Diffusion au personnel, évolutions des modalités ou outils pédagogiques', 'Analyse d''opportunité et de faisabilité des innovations']::text[],
   NULL, false, true, true),
  (26, 'Le prestataire mobilise les expertises, outils et réseaux nécessaires pour accueillir, accompagner/former ou orienter les publics en situation de handicap.',
   ARRAY['Liste des partenaires du territoire (Agefiph, Fiphfp, Cap emploi, MDPH)', 'Participation aux instances, comptes rendus de rencontres', 'Compétences et connaissances actualisées du référent handicap', 'Charte d''engagement pour l''accessibilité, recours à Ressource Handicap Formation']::text[],
   NULL, false, true, false),
  (27, 'Lorsque le prestataire fait appel à la sous-traitance ou au portage salarial, il s''assure du respect de la conformité au présent référentiel.',
   ARRAY['Contrats de sous-traitance', 'Modalités de sélection et de pilotage des sous-traitants (process de sélection, animation qualité, charte)', 'Justificatifs présentés par les sous-traitants ou salariés portés']::text[],
   NULL, false, false, false),
  (28, 'Lorsque les prestations dispensées au bénéficiaire comprennent des périodes de formation en situation de travail, le prestataire mobilise son réseau de partenaires socio-économiques pour co-construire l''ingénierie de formation et favoriser l''accueil en entreprise.',
   ARRAY['Comités de pilotage, comptes rendus de réunions', 'Liste des entreprises partenaires, conventions de partenariat', 'Contacts réseau SPE', 'Livret alternance, informations sur les partenariats']::text[],
   ARRAY['action_formation', 'formation_continue', 'formation_initiale', 'apprentissage']::text[], false, false, true),
  (29, 'Le prestataire développe des actions qui concourent à l''insertion professionnelle ou la poursuite d''étude par la voie de l''apprentissage ou par toute autre voie permettant de développer leurs connaissances et leurs compétences.',
   ARRAY['Actions d''insertion (salons d''orientation, visites d''entreprise, ateliers CV, aide à la recherche d''emploi, réseau d''anciens)', 'Actions de promotion de la poursuite d''études', 'Partenariats avec les acteurs de l''insertion, de l''emploi et le monde professionnel', 'Diffusion des offres d''apprentissage et d''emploi, information sur les compétitions des métiers']::text[],
   ARRAY['apprentissage']::text[], false, false, false),
  (30, 'Le prestataire recueille les appréciations des parties prenantes : bénéficiaires, financeurs, équipes pédagogiques et entreprises concernées.',
   ARRAY['Enquêtes de satisfaction, questionnaires, évaluations à chaud et/ou à froid', 'Comptes rendus d''entretiens et de réunions d''équipes', 'Sollicitation des financeurs (au moins annuelle) ou participation à leurs webinaires', 'Consultation des sites des financeurs (ex. Anotéa)', 'CBC : questionnaire à l''issue du bilan et à 6 mois']::text[],
   NULL, false, false, true),
  (31, 'Le prestataire met en œuvre des modalités de traitement des difficultés rencontrées par les parties prenantes, des réclamations exprimées par ces dernières, des aléas survenus en cours de prestation.',
   ARRAY['Description et mise en œuvre des modalités (accusé de réception, réponses aux réclamants)', 'Tableau de suivi des réclamations et de leur traitement', 'Système de médiation', 'Traitement des difficultés et aléas, solutions apportées en cas d''imprévu']::text[],
   NULL, false, false, false),
  (32, 'Le prestataire met en œuvre des mesures d''amélioration à partir de l''analyse des appréciations et des réclamations.',
   ARRAY['Identification et analyse des causes d''abandon ou d''insatisfaction', 'Plans d''action d''amélioration, actions spécifiques', 'Tableau de suivi des mesures d''amélioration', 'VAE : partage des résultats de l''accompagnement']::text[],
   NULL, false, true, false)
) AS v(number, requirement, expected_proofs, applies_to, certifying_only, new_entrant, minor_nc_possible)
WHERE i.referential_version = 'v9' AND i.number = v.number;

-- ── 2. Moteur d'évaluation : un dossier sans catégorie est une formation ────
CREATE OR REPLACE FUNCTION app.eval_qualiopi_counts(
  p_dossier_id UUID,
  OUT total INT,
  OUT satisfied INT,
  OUT entry_blocking_missing INT,
  OUT closing_blocking_missing INT,
  OUT blocking_missing INT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
  v_org        UUID;
  v_formation  UUID;
  v_action     TEXT;
  v_certifying BOOLEAN := false;
  v_checks     JSONB;
  v_details    JSONB;
BEGIN
  SELECT organization_id, formation_id, action_type::text
    INTO v_org, v_formation, v_action
  FROM app.dossiers WHERE id = p_dossier_id;

  -- Sans catégorie renseignée, le dossier est une action de formation (L. 6313-1, 1°).
  v_action := COALESCE(v_action, 'action_formation');

  -- Vérifications issues de la formation.
  SELECT
    jsonb_build_object(
      'formation_objectives',
        COALESCE(cardinality(array_remove(f.objectives, '')) > 0, false),
      'formation_pedagogy',
        COALESCE(btrim(f.pedagogical_method) <> '', false),
      'formation_programme',
        COALESCE(
          (f.metadata -> 'catalog' -> 'programme') IS NOT NULL
          OR btrim(COALESCE(f.metadata -> 'catalog' ->> 'programContent', '')) <> ''
          OR btrim(COALESCE(f.description, '')) <> '',
          false),
      'formation_evaluation_method',
        COALESCE(btrim(f.evaluation_method) <> '', false)
    ),
    COALESCE(btrim(COALESCE(f.rncp_code, '')) <> '' OR btrim(COALESCE(f.rs_code, '')) <> '', false)
  INTO v_checks, v_certifying
  FROM app.formations f
  WHERE f.id = v_formation;

  -- Vérifications issues de l'activité du dossier.
  v_checks := COALESCE(v_checks, '{}'::jsonb) || jsonb_build_object(
    'questionnaire_positionnement', EXISTS (
      SELECT 1 FROM app.questionnaire_assignments qa
      JOIN app.questionnaire_templates qt ON qt.id = qa.template_id
      WHERE qa.dossier_id = p_dossier_id AND qt.kind = 'positionnement'
        AND qa.status = 'completed'),
    'questionnaire_evaluation_acquis', EXISTS (
      SELECT 1 FROM app.questionnaire_assignments qa
      JOIN app.questionnaire_templates qt ON qt.id = qa.template_id
      WHERE qa.dossier_id = p_dossier_id AND qt.kind = 'evaluation_acquis'
        AND qa.status = 'completed'),
    'satisfaction_chaud', EXISTS (
      SELECT 1 FROM app.questionnaire_assignments qa
      JOIN app.questionnaire_templates qt ON qt.id = qa.template_id
      WHERE qa.dossier_id = p_dossier_id AND qt.kind = 'satisfaction_chaud'
        AND qa.status = 'completed'),
    'satisfaction_froid', EXISTS (
      SELECT 1 FROM app.questionnaire_assignments qa
      JOIN app.questionnaire_templates qt ON qt.id = qa.template_id
      WHERE qa.dossier_id = p_dossier_id AND qt.kind = 'satisfaction_froid'
        AND qa.status = 'completed'),
    'attendance_finalized', (
      EXISTS (SELECT 1 FROM app.attendance_sheets s WHERE s.dossier_id = p_dossier_id)
      AND NOT EXISTS (SELECT 1 FROM app.attendance_sheets s
                      WHERE s.dossier_id = p_dossier_id AND s.status <> 'finalized')),
    'trainer_assigned', EXISTS (
      SELECT 1 FROM app.dossier_trainers dt WHERE dt.dossier_id = p_dossier_id),
    'document_signed', EXISTS (
      SELECT 1 FROM app.documents d
      JOIN app.document_signatures ds ON ds.document_id = d.id
      WHERE d.dossier_id = p_dossier_id AND ds.status = 'signed')
  );

  WITH referentiel AS (
    -- Version en vigueur à la date du jour.
    SELECT i.*
    FROM app.qualiopi_indicators i
    WHERE i.scope = 'dossier'
      AND i.is_active
      AND i.referential_version <> 'legacy'
      AND (i.effective_from  IS NULL OR i.effective_from  <= CURRENT_DATE)
      AND (i.effective_until IS NULL OR i.effective_until >= CURRENT_DATE)
  ),
  resolved AS (
    SELECT
      i.id     AS indicator_id,
      i.number,
      i.code,
      i.auto_checks,
      -- Applicabilité : catégorie d'action du dossier, et prestation certifiante.
      ((i.applies_to IS NULL OR (v_action IS NOT NULL AND v_action = ANY (i.applies_to)))
        AND (NOT i.certifying_only OR v_certifying))                  AS applicable,
      COALESCE(orul.stage, srul.stage, 'none')                        AS stage,
      COALESCE(orul.is_blocking, srul.is_blocking, false)             AS is_blocking,
      COALESCE(orul.satisfaction_source, srul.satisfaction_source, 'proof') AS source
    FROM referentiel i
    LEFT JOIN app.qualiopi_indicator_rules srul
      ON srul.indicator_id = i.id AND srul.organization_id IS NULL
     AND srul.is_active AND srul.deleted_at IS NULL
    LEFT JOIN app.qualiopi_indicator_rules orul
      ON orul.indicator_id = i.id AND orul.organization_id = v_org
     AND orul.is_active AND orul.deleted_at IS NULL
  ),
  evaluated AS (
    SELECT
      r.*,
      CASE WHEN NOT r.applicable THEN false ELSE (
        -- Toutes les vérifications automatiques de l'indicateur passent…
        (cardinality(r.auto_checks) > 0 AND NOT EXISTS (
           SELECT 1 FROM unnest(r.auto_checks) AS k
           WHERE NOT COALESCE((v_checks ->> k)::boolean, false)))
        -- …ou une preuve valide est déposée pour ce dossier…
        OR EXISTS (
          SELECT 1 FROM app.qualiopi_proofs p
          WHERE p.dossier_id = p_dossier_id AND p.indicator_id = r.indicator_id
            AND p.deleted_at IS NULL
            AND (p.valid_from  IS NULL OR p.valid_from  <= CURRENT_DATE)
            AND (p.valid_until IS NULL OR p.valid_until >= CURRENT_DATE))
        -- …ou, pour une règle d'organisme fondée sur une source, celle-ci est remplie.
        OR COALESCE((v_checks ->> CASE r.source::text
             WHEN 'questionnaire_positionnement' THEN 'questionnaire_positionnement'
             WHEN 'questionnaire_evaluation'     THEN 'questionnaire_evaluation_acquis'
             WHEN 'attendance_signed'            THEN 'attendance_finalized'
             WHEN 'document_signed'              THEN 'document_signed'
           END)::boolean, false)
      ) END AS is_satisfied,
      (SELECT COALESCE(jsonb_object_agg(k, COALESCE((v_checks ->> k)::boolean, false)), '{}'::jsonb)
         FROM unnest(r.auto_checks) AS k) AS checks
    FROM resolved r
  )
  SELECT
    count(*) FILTER (WHERE applicable)::int,
    count(*) FILTER (WHERE applicable AND is_satisfied)::int,
    count(*) FILTER (WHERE applicable AND stage = 'entry'   AND is_blocking AND NOT is_satisfied)::int,
    count(*) FILTER (WHERE applicable AND stage = 'closing' AND is_blocking AND NOT is_satisfied)::int,
    count(*) FILTER (WHERE applicable AND is_blocking AND NOT is_satisfied)::int,
    COALESCE(jsonb_agg(jsonb_build_object(
      'indicator_id', indicator_id,
      'number',       number,
      'code',         code,
      'applicable',   applicable,
      -- Un indicateur non applicable ne bloque rien et n'a pas d'étape.
      'stage',        CASE WHEN applicable THEN stage::text ELSE 'none' END,
      'is_blocking',  applicable AND is_blocking,
      'satisfied',    is_satisfied,
      'source',       source,
      'checks',       checks
    ) ORDER BY number), '[]'::jsonb)
  INTO total, satisfied, entry_blocking_missing, closing_blocking_missing,
       blocking_missing, v_details
  FROM evaluated;

  INSERT INTO app.qualiopi_dossier_checklists AS c (
    dossier_id, organization_id, computed_at, total_indicators,
    satisfied_indicators, blocking_missing, entry_blocking_missing,
    closing_blocking_missing, details
  )
  VALUES (
    p_dossier_id, v_org, now(), total, satisfied, blocking_missing,
    entry_blocking_missing, closing_blocking_missing, v_details
  )
  ON CONFLICT (dossier_id) DO UPDATE SET
    computed_at              = now(),
    total_indicators         = EXCLUDED.total_indicators,
    satisfied_indicators     = EXCLUDED.satisfied_indicators,
    blocking_missing         = EXCLUDED.blocking_missing,
    entry_blocking_missing   = EXCLUDED.entry_blocking_missing,
    closing_blocking_missing = EXCLUDED.closing_blocking_missing,
    details                  = EXCLUDED.details;
END $$;

-- ── 3. Recalcul de toutes les check-lists ───────────────────────────────────
DO $$
DECLARE d RECORD;
BEGIN
  FOR d IN SELECT id FROM app.dossiers WHERE deleted_at IS NULL LOOP
    PERFORM app.recompute_qualiopi_checklist(d.id);
  END LOOP;
END $$;
