// Couche de conformité légale des documents d'un organisme de formation (France).
// Pur : aucun import next/supabase/react — réutilisable côté prompt IA ET modèles.
//
// Objectif : garantir que chaque document généré (IA ou modèle) porte les
// mentions obligatoires prévues par le Code du travail et le référentiel
// Qualiopi. Les bases légales sont indiquées à titre de repère ; l'organisme
// reste responsable de la validation finale de ses documents.

export type DocumentKind =
  | 'convention'
  | 'convocation'
  | 'programme'
  | 'attestation_presence'
  | 'attestation_fin'
  | 'certificat_realisation'
  | 'reglement_interieur'
  | 'livret_accueil'
  | 'devis'
  | 'facture'
  | 'feuille_emargement'
  | 'questionnaire'
  | 'autre';

export type LegalRequirement = {
  /** Libellé lisible du type de document. */
  label: string;
  /** Bases légales / réglementaires principales. */
  legalBasis: string[];
  /** Mentions obligatoires devant impérativement figurer dans le document. */
  mandatoryMentions: string[];
  /** Consigne de rédaction spécifique adressée à l'IA. */
  aiGuidance: string;
};

// Mention transverse : tout document émis par un OF déclaré rappelle son numéro
// de déclaration d'activité, assorti de la formule légale (art. L6352-12 C. trav.).
export const NDA_DISCLAIMER =
  "Cet enregistrement ne vaut pas agrément de l'État (article L.6352-12 du Code du travail).";

// Accessibilité des personnes en situation de handicap (Qualiopi, indicateur 26).
export const ACCESSIBILITY_MENTION =
  "Accessibilité : nos formations sont accessibles aux personnes en situation de handicap. Contactez le référent handicap de l'organisme pour étudier les adaptations possibles.";

// Information des personnes (RGPD art. 13-14) : tout document remis à un
// apprenant, une entreprise ou un financeur porte des données personnelles.
// `{contact}` est remplacé par l'e-mail de l'organisme quand il est connu.
export const RGPD_MENTION_TEMPLATE =
  "Données personnelles : les informations recueillies sont traitées par l'organisme de formation pour la gestion de votre dossier de formation et de ses obligations légales (base légale : contrat et obligation légale). Elles sont conservées pendant la durée légale de conservation applicable et ne sont transmises qu'aux destinataires habilités (financeurs, autorités de contrôle). Vous disposez d'un droit d'accès, de rectification, d'effacement, de limitation et d'opposition, ainsi que du droit d'introduire une réclamation auprès de la CNIL — pour l'exercer, écrivez à {contact}.";

/** Mention RGPD prête à imprimer ; `contact` = e-mail de l'organisme (ou libellé de repli). */
export function rgpdMention(contact?: string | null): string {
  const c = (contact ?? '').trim();
  return RGPD_MENTION_TEMPLATE.replace('{contact}', c || "l'organisme de formation");
}

export const LEGAL_REQUIREMENTS: Record<DocumentKind, LegalRequirement> = {
  convention: {
    label: 'Convention de formation professionnelle',
    legalBasis: ['Code du travail : art. L.6353-1, L.6353-2, D.6353-1', 'art. L.6354-1 (cessation anticipée)'],
    mandatoryMentions: [
      "Identité des parties (organisme de formation et cocontractant/financeur)",
      "Intitulé, objectifs et contenu de l'action de formation",
      "Public visé et prérequis / niveau de connaissances préalables requis",
      "Modalités de déroulement, durée totale (en heures) et dates, lieu ou modalité (présentiel/distanciel)",
      "Modalités de sanction de la formation et d'évaluation des acquis",
      "Prix (HT et, le cas échéant, TTC) et modalités de règlement",
      "Dispositions financières en cas de cessation anticipée ou d'abandon (art. L.6354-1)",
      "Numéro de déclaration d'activité de l'organisme + mention « ne vaut pas agrément »",
      "Emplacements de signature des deux parties (date, nom, qualité, cachet)",
    ],
    aiGuidance:
      "Rédige une convention de formation professionnelle juridiquement structurée en articles (Objet, Nature/durée, Effectifs, Prix, Modalités de règlement, Interruption/dédit, Différends, Signatures). N'invente aucun montant, date ou raison sociale : n'utilise que les données fournies ; laisse un espace explicite « [à compléter] » pour toute donnée manquante.",
  },
  convocation: {
    label: 'Convocation à la formation',
    legalBasis: ['Qualiopi (information du bénéficiaire avant le démarrage)'],
    mandatoryMentions: [
      "Identité de l'apprenant convoqué",
      "Intitulé de la formation",
      "Dates, horaires précis et lieu (ou lien/plateforme si distanciel)",
      "Nom du formateur / de l'organisme et contact",
      "Modalités d'accès et consignes pratiques",
      "Mention d'accessibilité et coordonnées du référent handicap",
    ],
    aiGuidance:
      "Rédige une convocation claire et concise. Indique précisément dates, horaires et lieu à partir des données fournies. Termine par la mention d'accessibilité PSH.",
  },
  programme: {
    label: 'Programme de formation',
    legalBasis: ['Qualiopi (indicateurs 1, 2, 4)', 'art. L.6353-1 C. trav.'],
    mandatoryMentions: [
      "Intitulé de la formation",
      "Objectifs pédagogiques (opérationnels et évaluables)",
      "Public visé et prérequis",
      "Durée totale en heures et modalités (présentiel/distanciel/hybride)",
      "Contenu détaillé / déroulé par module ou séquence",
      "Moyens et méthodes pédagogiques, techniques et d'encadrement",
      "Modalités d'évaluation des acquis et de suivi",
      "Modalités d'accessibilité aux personnes en situation de handicap",
      "Tarif et modalités d'inscription",
    ],
    aiGuidance:
      "Rédige un programme de formation complet et structuré (Objectifs, Public & prérequis, Durée & modalités, Contenu par module, Moyens pédagogiques, Évaluation, Accessibilité, Tarif). Formule des objectifs pédagogiques mesurables. N'ajoute pas de module inventé si les données ne le mentionnent pas.",
  },
  attestation_presence: {
    label: 'Attestation de présence',
    legalBasis: ['Justificatif de réalisation (financeurs)'],
    mandatoryMentions: [
      "Identité de l'apprenant",
      "Intitulé de la formation",
      "Dates et durée effective de présence (en heures)",
      "Identité et signature de l'organisme",
    ],
    aiGuidance:
      "Rédige une attestation de présence factuelle. Ne mentionne QUE des heures/dates issues des données fournies ; n'atteste jamais d'une présence non documentée.",
  },
  attestation_fin: {
    label: 'Attestation de fin de formation',
    legalBasis: ['art. L.6353-1 al. 3 du Code du travail'],
    mandatoryMentions: [
      "Identité de l'apprenant",
      "Intitulé et nature de l'action de formation",
      "Dates et durée de l'action (en heures)",
      "Objectifs de la formation",
      "Résultats de l'évaluation des acquis",
      "Identité, date, lieu et signature de l'organisme",
    ],
    aiGuidance:
      "Rédige une attestation de fin de formation conforme à l'art. L.6353-1 : elle DOIT mentionner les objectifs, la nature/durée de l'action et les résultats de l'évaluation des acquis. Si les résultats d'évaluation ne sont pas fournis, insère « [résultats de l'évaluation à compléter] » plutôt que de les inventer.",
  },
  certificat_realisation: {
    label: 'Certificat de réalisation',
    legalBasis: ['Arrêté du 21 décembre 2020', 'art. L.6313-1 du Code du travail'],
    mandatoryMentions: [
      "Identité de l'organisme (raison sociale, SIRET, n° de déclaration d'activité)",
      "Identité du bénéficiaire",
      "Intitulé de l'action et catégorie (art. L.6313-1)",
      "Dates de réalisation",
      "Durée totale RÉALISÉE (heures effectivement délivrées)",
      "Attestation que l'action a été suivie / réalisée",
      "Date, lieu et signature du représentant de l'organisme",
    ],
    aiGuidance:
      "Respecte strictement le modèle officiel de l'arrêté du 21/12/2020. La durée affichée est la durée RÉALISÉE. Document signé uniquement par l'organisme (aucune signature de l'apprenant).",
  },
  reglement_interieur: {
    label: 'Règlement intérieur',
    legalBasis: ['art. L.6352-3 à L.6352-5 et R.6352-1 et s. du Code du travail'],
    mandatoryMentions: [
      "Règles générales d'hygiène et de sécurité",
      "Mesures applicables en matière de santé et de sécurité",
      "Règles de discipline et nature/échelle des sanctions",
      "Droits de la défense des stagiaires",
      "Modalités de représentation des stagiaires (formations > 200 h)",
    ],
    aiGuidance:
      "Rédige un règlement intérieur conforme aux art. L.6352-3 et suivants, structuré en sections (Hygiène & sécurité, Discipline, Sanctions & droits de la défense, Représentation des stagiaires).",
  },
  livret_accueil: {
    label: "Livret d'accueil",
    legalBasis: ['Qualiopi (indicateurs 1, 3, 26)'],
    mandatoryMentions: [
      "Présentation de l'organisme et contacts",
      "Informations pratiques (accès, horaires, matériel)",
      "Modalités pédagogiques et d'évaluation",
      "Accessibilité et coordonnées du référent handicap",
      "Modalités de réclamation / médiation",
    ],
    aiGuidance:
      "Rédige un livret d'accueil chaleureux mais complet, incluant obligatoirement la section accessibilité (référent handicap) et les modalités de réclamation.",
  },
  devis: {
    label: 'Devis',
    legalBasis: ['art. L.111-1 C. consommation', 'mentions prestataire'],
    mandatoryMentions: [
      "Identité et coordonnées de l'organisme (SIRET, n° de déclaration d'activité)",
      "Identité du client",
      "Désignation détaillée de la prestation de formation",
      "Prix unitaire et total HT, TVA (ou mention d'exonération), total TTC",
      "Durée de validité de l'offre et modalités de règlement",
      "Date d'établissement du devis",
    ],
    aiGuidance:
      "Rédige un devis chiffré uniquement à partir des montants fournis. Si la TVA n'est pas précisée, mentionne l'exonération éventuelle (art. 261-4-4°a du CGI) sous forme de champ à confirmer.",
  },
  facture: {
    label: 'Facture',
    legalBasis: ['art. L.441-9 C. commerce', 'art. 242 nonies A CGI', 'art. 261-4-4°a CGI (exonération TVA formation)'],
    mandatoryMentions: [
      "Mention « Facture » et numéro unique séquentiel",
      "Date d'émission",
      "Identité complète de l'organisme (SIRET, TVA intracom. le cas échéant, n° déclaration d'activité)",
      "Identité du client",
      "Désignation et quantité de la prestation",
      "Prix HT, taux et montant de TVA (ou mention d'exonération art. 261-4-4°a du CGI), total TTC",
      "Conditions et date de règlement, pénalités de retard",
    ],
    aiGuidance:
      "Rédige une facture conforme. N'invente jamais un numéro de facture définitif : utilise « [n° de facture] ». Applique l'exonération de TVA formation seulement si les données l'indiquent.",
  },
  feuille_emargement: {
    label: "Feuille d'émargement",
    legalBasis: ['Justificatif de présence (financeurs)'],
    mandatoryMentions: [
      "Intitulé de la formation et référence du dossier",
      "Dates et créneaux (par demi-journée)",
      "Nom des participants et du formateur",
      "Cases de signature par demi-journée",
    ],
    aiGuidance:
      "Génère une trame de feuille d'émargement par demi-journée avec colonnes de signature. N'ajoute pas de signatures.",
  },
  questionnaire: {
    label: 'Questionnaire',
    legalBasis: ['Qualiopi (indicateurs 8, 10, 30, 31)'],
    mandatoryMentions: [
      "Intitulé de la formation concernée",
      "Objet du questionnaire (positionnement, satisfaction, évaluation des acquis)",
      "Questions claires et exploitables",
    ],
    aiGuidance:
      "Rédige un questionnaire adapté à son objet (positionnement / satisfaction à chaud ou à froid / évaluation des acquis). Questions neutres et exploitables.",
  },
  autre: {
    label: 'Document',
    legalBasis: [],
    mandatoryMentions: [
      "Identité de l'organisme (raison sociale, coordonnées)",
      "Mentions légales adaptées à la nature du document",
    ],
    aiGuidance:
      "Rédige un document professionnel adapté à la demande, en incluant l'en-tête de l'organisme et les mentions légales pertinentes.",
  },
};

export function getLegalRequirement(kind: string): LegalRequirement {
  return LEGAL_REQUIREMENTS[(kind as DocumentKind)] ?? LEGAL_REQUIREMENTS.autre;
}

// Bloc de consignes légales injecté dans le prompt IA pour un type donné.
export function legalPromptBlock(kind: string): string {
  const req = getLegalRequirement(kind);
  const basis = req.legalBasis.length ? `Bases légales : ${req.legalBasis.join(' ; ')}.` : '';
  const mentions = req.mandatoryMentions.map((m) => `  - ${m}`).join('\n');
  return [
    `TYPE DE DOCUMENT : ${req.label}.`,
    basis,
    'MENTIONS OBLIGATOIRES à faire figurer (conformité impérative) :',
    mentions,
    `CONSIGNE DE RÉDACTION : ${req.aiGuidance}`,
    `RAPPEL : ${NDA_DISCLAIMER}`,
  ]
    .filter(Boolean)
    .join('\n');
}
