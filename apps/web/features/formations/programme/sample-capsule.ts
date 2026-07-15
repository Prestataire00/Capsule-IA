// ARCHETYPE: shared
// Reproduction fidèle de la maquette PDF « Programme Capsule IA » sous forme de
// données Programme. Sert de contenu de démonstration / graine par défaut :
// l'utilisateur retrouve EXACTEMENT son document, puis édite librement.

import { DEFAULT_THEME, type Programme } from './types';

export const SAMPLE_CAPSULE_PROGRAMME: Programme = {
  schemaVersion: 1,
  theme: { ...DEFAULT_THEME },
  header: {
    logoUrl: '',
    kicker: 'Programme de Formation',
    orgName: 'CAPSULE IA',
    title: 'Acculturation à l’IA Générative',
    subtitle: 'Outils : Gemini & NotebookLM',
    metaItems: [
      { icon: 'clock', text: '2 journées de 7 heures' },
      { icon: 'location', text: 'Présentiel – Dans vos locaux' },
      { icon: 'users', text: '20 participants (1 groupe de 10/jour)' },
    ],
  },
  sections: [
    {
      id: 'presentation',
      type: 'richtext',
      title: 'Présentation',
      html:
        '<p><strong>Capsule IA</strong> est un organisme de formation spécialisé dans l’accompagnement des entreprises à l’ère de l’Intelligence Artificielle.</p>' +
        '<p>Ce programme sur mesure pour votre cabinet <strong>(secteur Juridique / Recrutement)</strong> est conçu pour être dispensé en une journée intensive de 7 heures, directement dans vos locaux. Il repose sur une approche résolument pratique (80% pratique – 20% théorie) pour permettre à vos collaborateurs de prendre en main immédiatement les outils Google IA dans leurs missions quotidiennes.</p>',
    },
    {
      id: 'infos',
      type: 'keyvalue',
      title: 'Informations générales',
      rows: [
        { label: 'Public cible', value: 'Salariés d’un cabinet juridique / recrutement (profils non techniques)' },
        { label: 'Effectif', value: '20 personnes, réparties en 1 groupe de 10/jour, soit 2 jours au total' },
        { label: 'Durée', value: '2 journées de 7 heures de formation effective' },
        { label: 'Format', value: 'Présentiel – Dans les locaux de l’entreprise' },
        { label: 'Outils abordés', value: 'Gemini (Google) + NotebookLM (Google)' },
        { label: 'Approche pédagogique', value: 'Théorie (20%) + Pratique (80%) avec études de cas métier' },
        { label: 'Prérequis', value: 'Aucune connaissance technique préalable requise' },
        {
          label: 'Accessibilité',
          value: 'Formation accessible aux personnes en situation de handicap. Des adaptations peuvent être étudiées au cas par cas.',
        },
      ],
    },
    {
      id: 'objectifs',
      type: 'bullets',
      title: 'Objectifs globaux de la formation',
      items: [
        'Comprendre les fondamentaux de l’IA générative et ses enjeux pour le secteur juridique et RH',
        'Prendre en main les outils Google IA (Gemini et NotebookLM) dans un contexte professionnel',
        'Maîtriser les bases du prompt engineering pour obtenir des résultats exploitables',
        'Appliquer l’IA à des tâches métier concrètes : comptes rendus, présentations, fiches de poste',
        'Intégrer les bonnes pratiques d’utilisation de l’IA en entreprise (RGPD, confidentialité, limites)',
      ],
    },
    {
      id: 'modules',
      type: 'modules',
      title: 'Vue d’ensemble du programme',
      overviewTitle: 'Vue d’ensemble du programme',
      overview: [
        { code: 'MODULE 1', title: 'Éco-système IA & Prompting', durationLabel: '2h 00' },
        { code: 'MODULE 2', title: 'Cas d’usage métier avec Gemini & NotebookLM', durationLabel: '3h 00' },
        { code: 'MODULE 3', title: 'Bonnes pratiques, limites & gestion des craintes', durationLabel: '2h 00' },
      ],
      totalLabel: 'Durée totale – 1 journée de formation',
      totalValue: '7 heures',
      modules: [
        {
          code: 'MODULE 1',
          title: 'Éco-système IA & Prompting',
          durationLabel: '2h 00',
          submodules: [
            {
              code: 'M1.1',
              title: 'Démystifier l’IA générative',
              durationLabel: '',
              contenu: [
                'Les grands concepts : IA, Machine Learning, IA générative',
                'Panorama des outils disponibles et focus sur l’écosystème Google',
                'Présentation de Gemini et NotebookLM : à quoi servent-ils ?',
                'Enjeux éthiques et réglementaires (RGPD, confidentialité des données)',
              ],
              objectifs: [
                'Définir l’IA générative et ses principales applications',
                'Situer Gemini et NotebookLM dans l’écosystème IA',
                'Comprendre les enjeux de confidentialité en entreprise',
              ],
            },
            {
              code: 'M1.2',
              title: 'Apprendre à écrire un prompt',
              durationLabel: '',
              contenu: [
                'Principes fondamentaux du prompt engineering : rôle, contexte, consigne, format',
                'Les erreurs classiques et comment les éviter',
                'Atelier pratique : rédiger des prompts adaptés au contexte juridique/RH',
                'Démonstration en direct sur Gemini',
              ],
              objectifs: [
                'Appliquer les bonnes pratiques du prompting',
                'Formuler des instructions claires et exploitables',
                'Générer des contenus pertinents avec Gemini',
              ],
            },
          ],
        },
        {
          code: 'MODULE 2',
          title: 'Cas d’usage métier avec Gemini & NotebookLM',
          durationLabel: '3h 00',
          submodules: [
            {
              code: 'M2.1',
              title: 'Gemini au service du quotidien',
              durationLabel: '',
              contenu: [
                'Rédiger un compte rendu de réunion avec Gemini',
                'Créer une présentation PowerPoint à partir d’un brief texte',
                'Appliquer une charte graphique à un document via l’IA',
                'Atelier guidé : les participants réalisent les tâches en direct',
              ],
              objectifs: [
                'Utiliser Gemini pour produire des livrables professionnels',
                'Gagner du temps sur la mise en forme documentaire',
                'Adapter les sorties IA aux standards visuels de l’entreprise',
              ],
            },
            {
              code: 'M2.2',
              title: 'Étude de cas 1 – Intégration collective',
              durationLabel: '',
              contenu: [
                'Utiliser l’IA pour structurer un process d’intégration de nouveaux collaborateurs',
                'Générer un livret d’accueil, un planning d’intégration ou un email de bienvenue',
                'Mise en situation : les participants travaillent sur un cas réel ou fictif',
              ],
              objectifs: [
                'Appliquer l’IA à un processus RH concret',
                'Produire des documents d’intégration exploitables',
                'Évaluer la pertinence et ajuster les résultats',
              ],
            },
            {
              code: 'M2.3',
              title: 'Étude de cas 2 – Recrutement avec Gemini & NotebookLM',
              durationLabel: '',
              contenu: [
                'Rédiger une fiche de poste complète avec Gemini',
                'Créer une fiche de recrutement structurée',
                'Rédiger un message LinkedIn d’approche candidat ciblé',
                'Utiliser NotebookLM pour analyser des CV ou des documents RH',
                'Atelier : les participants produisent leurs livrables',
              ],
              objectifs: [
                'Utiliser l’IA pour automatiser la production documentaire en recrutement',
                'Exploiter NotebookLM pour l’analyse et la synthèse de documents',
                'Créer des messages de prospection candidat percutants avec l’IA',
              ],
            },
          ],
        },
        {
          code: 'MODULE 3',
          title: 'Bonnes pratiques, limites & gestion des craintes',
          durationLabel: '2h 00',
          submodules: [
            {
              code: 'M3.1',
              title: 'Bonnes pratiques & cadrage éthique',
              durationLabel: '',
              contenu: [
                'Confidentialité des données et RGPD : ce qu’il faut savoir avant de saisir quoi que ce soit',
                'Hallucinations et biais de l’IA : comprendre et vérifier',
                'Vérification des sources et fact-checking',
                'Règles d’usage interne à définir en entreprise',
              ],
              objectifs: [
                'Identifier les risques liés à l’utilisation de l’IA en contexte professionnel',
                'Adopter les réflexes de vérification adaptés',
                'Définir un cadre d’utilisation responsable de l’IA dans son cabinet',
              ],
            },
            {
              code: 'M3.2',
              title: 'Évoquer les craintes & construire sa posture face à l’IA',
              durationLabel: '',
              contenu: [
                'Temps d’échange ouvert : parole aux participants',
                'Remplacement des postes, évolution des métiers : démystifier les idées reçues',
                'L’IA comme outil d’augmentation des compétences, pas de substitution',
                'Feuille de route individuelle : comment continuer à monter en compétences après la formation',
              ],
              objectifs: [
                'Exprimer et dépasser ses appréhensions face à l’IA',
                'Repositionner l’IA comme un levier de valeur ajoutée',
                'Repartir avec un plan d’action personnel concret',
              ],
            },
          ],
        },
      ],
    },
    {
      id: 'deroule',
      type: 'schedule',
      title: 'Déroulé de la journée',
      columns: ['Horaire', 'Contenu', 'Durée'],
      rows: [
        { time: '9h00 – 9h15', label: 'Accueil, tour de table & test de positionnement', duration: '15 min' },
        { time: '9h15 – 11h15', label: 'MODULE 1 – Éco-système IA & Prompting', duration: '2h 00' },
        { time: '11h15 – 11h30', label: 'Pause', duration: '15 min' },
        { time: '11h30 – 14h30', label: 'MODULE 2 – Cas d’usage métier (Gemini & NotebookLM)', duration: '3h 00' },
        { time: '14h30 – 15h15', label: 'Pause déjeuner (indicatif)', duration: '45 min' },
        { time: '15h15 – 17h15', label: 'MODULE 3 – Bonnes pratiques, limites & gestion des craintes', duration: '2h 00' },
        { time: '17h15 – 17h30', label: 'Bilan, évaluation à chaud & clôture', duration: '15 min' },
      ],
    },
    {
      id: 'methodes',
      type: 'keyvalue',
      title: 'Méthodes et moyens pédagogiques',
      rows: [
        {
          label: 'Méthodes',
          value:
            'Expositive : présentations théoriques et démonstrations en direct. Active : ateliers pratiques, mises en situation sur Gemini et NotebookLM. Interrogative : quiz, échanges, questions/réponses. Co-développement : partage d’expériences et résolution collective.',
        },
        {
          label: 'Moyens',
          value:
            'Vidéoprojecteur et accès Wi-Fi fournis par l’entreprise hôte. Support de formation dématérialisé remis à chaque participant. Accès à Gemini et NotebookLM (comptes Google). Fiches pratiques de prompts métier (Juridique / RH).',
        },
        { label: 'Encadrement', value: 'Ismael LE PENNEC : Formateur expert en IA générative et ingénierie pédagogique.' },
        {
          label: 'Compétences visées',
          value:
            'Décrypter le vocabulaire de l’IA • Maîtriser les bases du prompt engineering • Utiliser Gemini et NotebookLM sur des tâches métier • Adopter les bonnes pratiques RGPD et éthiques.',
        },
      ],
    },
    {
      id: 'suivi',
      type: 'keyvalue',
      title: 'Modalités de suivi et d’évaluation',
      rows: [
        {
          label: 'Évaluation des acquis',
          value:
            'Diagnostique : quiz de positionnement en début de journée.\nFormative : exercices pratiques validés par le formateur au fil des modules.\nSommative : livraison des livrables métier réalisés en séance (compte rendu, fiche de poste, message LinkedIn…).',
        },
        {
          label: 'Suivi & satisfaction',
          value:
            'Feuilles de présence émargées.\nAttestation de fin de formation individuelle (art. L.6353-1 du Code du Travail).\nQuestionnaire de satisfaction à chaud en fin de journée.',
        },
      ],
    },
    {
      id: 'accueil',
      type: 'keyvalue',
      title: 'Modalités d’accueil et d’accompagnement',
      rows: [
        { label: 'Accueil', value: 'Email de bienvenue avec les informations pratiques (programme, formateur référent) après signature de la convention.' },
        { label: 'Avant la formation', value: 'Test de positionnement individuel envoyé en amont. Session de vérification technique si nécessaire (accès Gemini / comptes Google).' },
        { label: 'Pendant', value: 'Le formateur est disponible pour les questions tout au long de la journée. Rythme adapté au niveau du groupe.' },
        { label: 'Après', value: 'Accès aux supports et fiches de prompts remis en fin de journée. Les livrables réalisés sont conservés par les participants.' },
        { label: 'Accessibilité', value: 'Formation accessible aux personnes en situation de handicap. Merci de nous contacter par mail afin de nous partager vos besoins spécifiques.' },
        { label: 'Délai d’accès', value: 'Inscription à effectuer au plus tard 10 jours ouvrés avant la date souhaitée. Après validation du devis et signature de la convention, le participant reçoit la convocation et le programme.' },
      ],
    },
  ],
  footer: {
    legalLine: 'CAPSULE IA – Société par actions simplifiée (SAS)',
    lines: [
      'SIREN 989 531 116 – SIRET 989 531 116 00014',
      '25 rue Romain Rolland, 45100 Orléans | Tél. : 07 67 93 30 36 | contact@capsule.ia.com',
      'NDA : 24450461545 – Région Centre-Val de Loire | Code NAF/APE : 85.59A',
    ],
    versionLine: 'Version 1 – Juin 2026 | Capsule IA',
  },
};
