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
