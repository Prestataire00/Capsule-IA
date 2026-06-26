import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { buildBillingPlan, type FunderAllocationInput } from '@/features/billing/domain/billing-plan';

/** Libellés des modes de financement (app.funder_kind). */
export const FUNDER_KIND_LABELS: Record<string, string> = {
  opco: 'OPCO',
  cpf: 'CPF',
  pole_emploi: 'France Travail',
  region: 'Région',
  autofinancement: 'Autofinancement',
  entreprise: 'Entreprise',
  faf_ca: 'FAF / Chef d’entreprise',
  agefiph: 'Agefiph',
  autre: 'Autre',
};

/** Un « payeur » donnant lieu à une convention : un financeur, ou le reste à charge. */
export type DossierPayer = {
  /** Identifiant stable du payeur : funder_id, ou 'reste' pour le reste à charge. */
  payer: string;
  /** Nom affiché dans la section « Financeur » (ou « Entreprise / apprenant »). */
  funderName: string;
  /** Libellé du mode de financement (CPF, Autofinancement, Reste à charge…). */
  modeLabel: string;
  /** Montant pris en charge par ce payeur (centimes). */
  amountCents: number;
  /** N° de dossier externe (ex. dossier CPF), si présent. */
  externalFileNumber: string | null;
};

/** Ligne brute app.dossier_funders (jointe à funders) telle que chargée depuis la base. */
export type DossierFunderRow = {
  funder_id: string;
  amount_cents: number;
  external_file_number: string | null;
  funder: { name: string; kind: string } | null;
};

/**
 * Logique pure : à partir du total HT et des lignes financeurs, calcule les payeurs
 * (chaque financeur dont le montant > 0, plus le reste à charge entreprise/apprenant s'il est > 0).
 * Réutilise buildBillingPlan. Renvoie [] si ni financeur ni reste à charge (→ convention générique).
 */
export function derivePayers(totalCents: number, rows: DossierFunderRow[]): DossierPayer[] {
  const extByFunder = new Map<string, string | null>();
  const nameByFunder = new Map<string, string>();
  for (const r of rows) {
    extByFunder.set(r.funder_id, r.external_file_number);
    nameByFunder.set(r.funder_id, r.funder?.name ?? 'Financeur');
  }

  const allocations: FunderAllocationInput[] = rows.map((r) => ({
    funderId: r.funder_id,
    name: r.funder?.name ?? 'Financeur',
    kind: r.funder?.kind ?? 'autre',
    allocatedHtCents: r.amount_cents,
    status: 'pending',
  }));

  const plan = buildBillingPlan(totalCents, allocations, []);

  const payers: DossierPayer[] = plan.funders
    .filter((f) => f.allocatedHtCents > 0)
    .map((f) => {
      const funderId = f.payer as string;
      return {
        payer: funderId,
        funderName: nameByFunder.get(funderId) ?? f.label,
        modeLabel: f.kind ? FUNDER_KIND_LABELS[f.kind] ?? f.kind : 'Financeur',
        amountCents: f.allocatedHtCents,
        externalFileNumber: extByFunder.get(funderId) ?? null,
      };
    });

  if (plan.resteACharge.allocatedHtCents > 0) {
    payers.push({
      payer: 'reste',
      funderName: 'Entreprise / apprenant',
      modeLabel: 'Reste à charge (financement direct)',
      amountCents: plan.resteACharge.allocatedHtCents,
      externalFileNumber: null,
    });
  }

  return payers;
}

/**
 * Charge le total du dossier + ses lignes app.dossier_funders, puis dérive les payeurs
 * (cf. {@link derivePayers}).
 */
export async function loadDossierPayers(
  sb: SupabaseClient,
  dossierId: string,
): Promise<DossierPayer[]> {
  const [{ data: dossierRow }, { data: funderRows }] = await Promise.all([
    sb.schema('app').from('dossiers').select('total_amount_cents').eq('id', dossierId).maybeSingle(),
    sb
      .schema('app')
      .from('dossier_funders')
      .select('funder_id, amount_cents, external_file_number, funder:funders(name, kind)')
      .eq('dossier_id', dossierId),
  ]);

  const total = (dossierRow as { total_amount_cents: number | null } | null)?.total_amount_cents ?? 0;
  const rows = (funderRows ?? []) as unknown as DossierFunderRow[];
  return derivePayers(total, rows);
}
