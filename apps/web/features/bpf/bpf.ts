// Bilan Pédagogique et Financier (BPF — Cerfa 10443).
// Logique pure : ventilation des produits HT par origine de financement,
// selon les lignes officielles du cadre financier (B). Aucun I/O.

export type BpfLineKey =
  | 'entreprises' // entreprises pour la formation de leurs salariés
  | 'opco' // OPCO
  | 'france_travail' // France Travail (ex-Pôle emploi)
  | 'region' // conseils régionaux
  | 'etat_collectivites' // État, autres ressources publiques / collectivités
  | 'cpf' // CPF (Caisse des dépôts)
  | 'particuliers' // contrats conclus avec des particuliers
  | 'autres_of' // contrats avec d'autres organismes de formation (sous-traitance reçue)
  | 'autres'; // autres produits

export const BPF_LINES: { key: BpfLineKey; code: string; label: string }[] = [
  { key: 'entreprises', code: 'B-1', label: 'Entreprises pour la formation de leurs salariés' },
  { key: 'opco', code: 'B-2', label: 'OPCO' },
  { key: 'france_travail', code: 'B-3c', label: 'France Travail' },
  { key: 'region', code: 'B-3b', label: 'Conseils régionaux' },
  { key: 'etat_collectivites', code: 'B-3', label: 'État / autres ressources publiques' },
  { key: 'cpf', code: 'B-6', label: 'CPF (Caisse des dépôts)' },
  { key: 'particuliers', code: 'B-4', label: 'Contrats avec des particuliers' },
  { key: 'autres_of', code: 'B-5', label: "Contrats avec d'autres organismes de formation" },
  { key: 'autres', code: 'B-7', label: 'Autres produits' },
];

/** Mappe le type de financeur (funder.kind) vers la ligne BPF. */
export function funderKindToBpfLine(kind: string | null): BpfLineKey {
  switch (kind) {
    case 'opco':
      return 'opco';
    case 'cpf':
      return 'cpf';
    case 'region':
      return 'region';
    case 'pole_emploi':
      return 'france_travail';
    case 'entreprise':
      return 'entreprises';
    case 'autofinancement':
      return 'particuliers';
    default:
      return 'autres';
  }
}

export type BpfInvoiceInput = {
  subtotalHtCents: number;
  funderKind: string | null;
  hasCompany: boolean;
  status: string;
};

const COUNTED_STATUSES = new Set(['issued', 'paid', 'partially_paid', 'overdue']);

/**
 * Ligne BPF d'une facture : par le financeur si présent, sinon par le
 * destinataire (entreprise → B-1, particulier → B-4).
 */
export function invoiceToBpfLine(inv: BpfInvoiceInput): BpfLineKey {
  if (inv.funderKind) return funderKindToBpfLine(inv.funderKind);
  return inv.hasCompany ? 'entreprises' : 'particuliers';
}

export type BpfFinancial = {
  lines: Record<BpfLineKey, number>; // cents HT
  totalCents: number;
};

/** Ventile les produits HT des factures (comptées) par ligne BPF. */
export function buildBpfFinancial(invoices: BpfInvoiceInput[]): BpfFinancial {
  const lines = Object.fromEntries(BPF_LINES.map((l) => [l.key, 0])) as Record<BpfLineKey, number>;
  let total = 0;
  for (const inv of invoices) {
    if (!COUNTED_STATUSES.has(inv.status)) continue;
    const amount = Math.max(0, Math.round(inv.subtotalHtCents));
    lines[invoiceToBpfLine(inv)] += amount;
    total += amount;
  }
  return { lines, totalCents: total };
}

// ---------------------------------------------------------------------------
// Ventilations fines (cadre C détaillé) et charges (Cerfa 10443*17 complet).
// ---------------------------------------------------------------------------

export const TRAINEE_CATEGORY_LABEL: Record<string, string> = {
  salarie: 'Salariés (financement employeur / OPCO)',
  demandeur_emploi: "Personnes en recherche d'emploi",
  particulier: 'Particuliers à leurs propres frais',
  apprenti: 'Apprentis',
  autre: 'Autres stagiaires',
};

export const ACTION_TYPE_LABEL: Record<string, string> = {
  action_formation: 'Actions de formation',
  bilan_competences: 'Bilans de compétences',
  vae: 'Actions de VAE',
  apprentissage: 'Actions par apprentissage',
  formation_continue: 'Formation continue',
  formation_initiale: 'Formation initiale',
};

// Ordre d'affichage stable dans le PDF.
export const TRAINEE_CATEGORY_ORDER = ['salarie', 'demandeur_emploi', 'particulier', 'apprenti', 'autre'] as const;
export const ACTION_TYPE_ORDER = [
  'action_formation', 'bilan_competences', 'vae', 'apprentissage', 'formation_continue', 'formation_initiale',
] as const;

export type BpfBreakdownRow = { key: string; label: string; stagiaires: number; heures: number };
export type BpfNsfRow = { code: string; label: string; heures: number };

export type BpfCharges = {
  totalCents: number;
  salairesFormateursCents: number;
  achatsFormationCents: number;
  sousTraitanceConfieeCents: number;
  sousTraitanceConfieeHeures: number;
  autresCents: number;
};

export type DepenseBpf = {
  readonly kind: string;
  readonly amountCents: number;
  readonly hours: number | null;
  /** Date de la charge, quand elle a été saisie. */
  readonly incurredOn: string | null;
  /**
   * Date de l'objet qui porte la charge — fin du dossier, début de la séance.
   * Sert de rattachement de repli quand la charge n'est pas datée.
   */
  readonly rattachementOn: string | null;
};

export type TriDepenses = {
  readonly retenues: DepenseBpf[];
  /**
   * Charges qu'aucune date ne permet de rattacher à une année. Elles sont
   * écartées du BPF — mais comptées, parce qu'un total silencieusement
   * incomplet est pire qu'un total accompagné de son manque.
   */
  readonly sansAnnee: DepenseBpf[];
};

/**
 * Quelles charges appartiennent à l'exercice.
 *
 * Deux tables alimentent ce tri : les dépenses d'un dossier
 * (`dossier_expenses`) et celles d'une séance ou d'une formation
 * (`formation_expenses`). Les secondes étaient purement absentes du BPF — une
 * salle louée pour une session de groupe ne se rattache à aucun dossier, elle
 * disparaissait donc du cadre des charges.
 *
 * La date de la charge prime ; à défaut, on rattache par l'objet porteur. Une
 * charge sans aucune date n'est pas rangée dans l'année en cours par défaut :
 * elle gonflerait chaque exercice à tour de rôle.
 */
export function depensesDeLAnnee(
  depenses: readonly DepenseBpf[],
  debut: string,
  fin: string,
): TriDepenses {
  const retenues: DepenseBpf[] = [];
  const sansAnnee: DepenseBpf[] = [];
  for (const d of depenses) {
    const date = d.incurredOn ?? d.rattachementOn;
    if (date === null) sansAnnee.push(d);
    else if (date >= debut && date <= fin) retenues.push(d);
  }
  return { retenues, sansAnnee };
}

/** Ventile des dépenses déjà rattachées à l'année vers les postes de charges BPF. */
export function buildBpfCharges(
  expenses: Array<{ kind: string; amountCents: number; hours: number | null }>,
): BpfCharges {
  const c: BpfCharges = {
    totalCents: 0,
    salairesFormateursCents: 0,
    achatsFormationCents: 0,
    sousTraitanceConfieeCents: 0,
    sousTraitanceConfieeHeures: 0,
    autresCents: 0,
  };
  for (const e of expenses) {
    const amount = Math.max(0, Math.round(e.amountCents));
    c.totalCents += amount;
    switch (e.kind) {
      case 'salaire_formateur':
        c.salairesFormateursCents += amount;
        break;
      case 'achat_formation':
        c.achatsFormationCents += amount;
        break;
      case 'sous_traitance_confiee':
        c.sousTraitanceConfieeCents += amount;
        c.sousTraitanceConfieeHeures += Math.max(0, e.hours ?? 0);
        break;
      default:
        c.autresCents += amount;
    }
  }
  return c;
}
