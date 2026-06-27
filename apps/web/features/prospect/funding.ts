export const FUNDER_VALUES = [
  'opco',
  'cpf',
  'faf_ca',
  'agefiph',
  'entreprise',
  'autofinancement',
] as const;

export type FunderValue = (typeof FUNDER_VALUES)[number];

export type FunderOption = {
  value: FunderValue;
  label: string;
  hint: string;
};

export const FUNDER_OPTIONS: readonly FunderOption[] = [
  {
    value: 'opco',
    label: 'OPCO',
    hint: 'Prise en charge par votre opérateur de compétences (salariés).',
  },
  {
    value: 'cpf',
    label: 'CPF',
    hint: 'Compte personnel de formation (Mon Compte Formation).',
  },
  {
    value: 'faf_ca',
    label: 'FAF / Chef d’entreprise',
    hint: 'Fonds d’assurance formation des indépendants et chefs d’entreprise.',
  },
  {
    value: 'agefiph',
    label: 'Agefiph',
    hint: 'Financement lié à une reconnaissance de travailleur handicapé.',
  },
  {
    value: 'entreprise',
    label: 'Entreprise',
    hint: 'Financement direct par l’employeur.',
  },
  {
    value: 'autofinancement',
    label: 'Autofinancement',
    hint: 'Financement à titre personnel.',
  },
];

export type DocRequirement = {
  key: string;
  label: string;
  hint: string;
  required: boolean;
};

const DOCS_BY_FUNDER: Record<string, readonly DocRequirement[]> = {
  opco: [
    {
      key: 'payslip',
      label: 'Bulletin de salaire',
      hint: 'Dernier bulletin de salaire du bénéficiaire.',
      required: true,
    },
    {
      key: 'collective_agreement',
      label: 'Convention collective',
      hint: 'Référence de la convention collective applicable.',
      required: true,
    },
  ],
  cpf: [
    {
      key: 'id',
      label: 'Pièce d’identité',
      hint: 'Pièce d’identité du bénéficiaire (facultatif).',
      required: false,
    },
  ],
  faf_ca: [
    {
      key: 'faf_attestation',
      label: 'Attestation FAF',
      hint: 'Attestation de versement de la contribution formation.',
      required: true,
    },
    {
      key: 'kbis',
      label: 'Extrait Kbis',
      hint: 'Extrait Kbis de moins de 3 mois.',
      required: true,
    },
  ],
  agefiph: [
    {
      key: 'rqth_proof',
      label: 'Justificatif RQTH',
      hint: 'Notification de reconnaissance de la qualité de travailleur handicapé.',
      required: true,
    },
  ],
  entreprise: [
    {
      key: 'employer_agreement',
      label: 'Accord employeur',
      hint: 'Accord écrit de l’employeur pour la prise en charge.',
      required: true,
    },
    {
      key: 'purchase_order',
      label: 'Bon de commande',
      hint: 'Bon de commande de l’entreprise (facultatif).',
      required: false,
    },
  ],
  autofinancement: [
    {
      key: 'id',
      label: 'Pièce d’identité',
      hint: 'Pièce d’identité du bénéficiaire (facultatif).',
      required: false,
    },
  ],
};

export function requiredDocsForFunders(
  funderKinds: readonly string[],
): DocRequirement[] {
  const seen = new Set<string>();
  const result: DocRequirement[] = [];

  for (const kind of funderKinds) {
    const docs = DOCS_BY_FUNDER[kind] ?? [];
    for (const doc of docs) {
      if (seen.has(doc.key)) continue;
      seen.add(doc.key);
      result.push(doc);
    }
  }

  return result;
}

// Pièces demandées selon la SITUATION du candidat (en plus des pièces par financeur).
const DOCS_BY_SITUATION: Record<string, readonly DocRequirement[]> = {
  independant: [
    {
      key: 'urssaf',
      label: 'Attestation URSSAF',
      hint: 'Attestation de vigilance / affiliation URSSAF.',
      required: true,
    },
  ],
  // Le mode entreprise demande la convention collective (même clé que la pièce OPCO → dédoublonnée).
  entreprise: [
    {
      key: 'collective_agreement',
      label: 'Convention collective',
      hint: 'Référence ou copie de la convention collective applicable.',
      required: true,
    },
  ],
};

export function requiredDocsForSituation(situation: string): DocRequirement[] {
  return [...(DOCS_BY_SITUATION[situation] ?? [])];
}

/**
 * Pièces requises = union (dédoublonnée par clé) des pièces par financeur et par situation.
 * Source unique réutilisée par le formulaire d'inscription et la vérification CRM.
 */
export function requiredDocs(
  funderKinds: readonly string[],
  situation: string,
): DocRequirement[] {
  const seen = new Set<string>();
  const result: DocRequirement[] = [];
  for (const doc of [...requiredDocsForFunders(funderKinds), ...requiredDocsForSituation(situation)]) {
    if (seen.has(doc.key)) continue;
    seen.add(doc.key);
    result.push(doc);
  }
  return result;
}

export function derivePrimaryFunder(funderKinds: readonly string[]): string {
  const primary = funderKinds[0];
  if (primary === undefined) {
    throw new Error('derivePrimaryFunder: funderKinds must not be empty');
  }
  return primary;
}
