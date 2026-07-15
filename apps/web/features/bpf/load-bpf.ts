import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  buildBpfFinancial,
  buildBpfCharges,
  TRAINEE_CATEGORY_LABEL,
  ACTION_TYPE_LABEL,
  TRAINEE_CATEGORY_ORDER,
  ACTION_TYPE_ORDER,
  type BpfFinancial,
  type BpfInvoiceInput,
  type BpfBreakdownRow,
  type BpfNsfRow,
  type BpfCharges,
} from './bpf';
import { NSF_CODES } from '@/features/formations/constants';

export type BpfPedago = { stagiaires: number; heures: number; actions: number; dossiers: number };
export type BpfFormateurs = { internes: number; externes: number; total: number };
export type BpfAggregates = {
  financial: BpfFinancial;
  pedago: BpfPedago;
  formateurs: BpfFormateurs;
  byCategory: BpfBreakdownRow[];
  byActionType: BpfBreakdownRow[];
  byNsf: BpfNsfRow[];
  charges: BpfCharges;
};

const NSF_LABEL = new Map<string, string>(NSF_CODES.map((o) => [o.value as string, o.label]));

/**
 * Agrège tout le BPF (Cerfa 10443*17) pour une année : cadre financier,
 * cadre pédagogique (global + ventilations par catégorie de stagiaire, type
 * d'action et spécialité NSF), formateurs et charges (dépenses par dossier).
 * RLS-scopé via `sb`.
 */
export async function loadBpfAggregates(sb: SupabaseClient, year: number): Promise<BpfAggregates> {
  const start = `${year}-01-01`;
  const end = `${year}-12-31`;

  // Cadre financier — produits : factures émises dans l'année (HT), par origine.
  const { data: invRows } = await sb
    .schema('app')
    .from('invoices')
    .select('subtotal_cents, status, company_id, funder:funders(kind)')
    .gte('issued_at', start)
    .lte('issued_at', end)
    .is('deleted_at', null);
  const invoices: BpfInvoiceInput[] = (
    (invRows ?? []) as unknown as Array<{
      subtotal_cents: number;
      status: string;
      company_id: string | null;
      funder: { kind: string } | null;
    }>
  ).map((i) => ({
    subtotalHtCents: i.subtotal_cents,
    status: i.status,
    funderKind: i.funder?.kind ?? null,
    hasCompany: i.company_id != null,
  }));
  const financial = buildBpfFinancial(invoices);

  // Cadre pédagogique : dossiers dont la période chevauche l'année.
  const { data: dossierRows } = await sb
    .schema('app')
    .from('dossiers')
    .select('id, learner_id, total_hours, formation_id, action_type, trainee_category, status, start_date, end_date, formation:formations(metadata)')
    .lte('start_date', end)
    .gte('end_date', start)
    .in('status', ['scheduled', 'active', 'completed', 'closed']);
  const dossiers = (dossierRows ?? []) as unknown as Array<{
    id: string;
    learner_id: string | null;
    total_hours: number | null;
    formation_id: string | null;
    action_type: string | null;
    trainee_category: string | null;
    formation: { metadata: { catalog?: { codeNsf?: string | null } | null } | null } | null;
  }>;

  const stagiaires = new Set(dossiers.map((d) => d.learner_id).filter(Boolean)).size;
  const heures = dossiers.reduce((s, d) => s + (d.total_hours ?? 0), 0);
  const actions = new Set(dossiers.map((d) => d.formation_id).filter(Boolean)).size;
  const dossierIds = dossiers.map((d) => d.id);

  // Ventilation par catégorie de stagiaire et par type d'action
  // (stagiaires distincts + heures-stagiaires).
  const catLearners = new Map<string, Set<string>>();
  const catHeures = new Map<string, number>();
  const actLearners = new Map<string, Set<string>>();
  const actHeures = new Map<string, number>();
  const nsfHeures = new Map<string, number>();
  for (const d of dossiers) {
    const cat = d.trainee_category ?? 'autre';
    const act = d.action_type ?? 'action_formation';
    const h = d.total_hours ?? 0;
    if (!catLearners.has(cat)) catLearners.set(cat, new Set());
    if (d.learner_id) catLearners.get(cat)!.add(d.learner_id);
    catHeures.set(cat, (catHeures.get(cat) ?? 0) + h);
    if (!actLearners.has(act)) actLearners.set(act, new Set());
    if (d.learner_id) actLearners.get(act)!.add(d.learner_id);
    actHeures.set(act, (actHeures.get(act) ?? 0) + h);
    const nsf = d.formation?.metadata?.catalog?.codeNsf?.trim() || 'non_renseigne';
    nsfHeures.set(nsf, (nsfHeures.get(nsf) ?? 0) + h);
  }

  const byCategory: BpfBreakdownRow[] = TRAINEE_CATEGORY_ORDER
    .map((key) => ({
      key,
      label: TRAINEE_CATEGORY_LABEL[key] ?? key,
      stagiaires: catLearners.get(key)?.size ?? 0,
      heures: catHeures.get(key) ?? 0,
    }))
    .filter((r) => r.stagiaires > 0 || r.heures > 0);

  const byActionType: BpfBreakdownRow[] = ACTION_TYPE_ORDER
    .map((key) => ({
      key,
      label: ACTION_TYPE_LABEL[key] ?? key,
      stagiaires: actLearners.get(key)?.size ?? 0,
      heures: actHeures.get(key) ?? 0,
    }))
    .filter((r) => r.stagiaires > 0 || r.heures > 0);

  const byNsf: BpfNsfRow[] = [...nsfHeures.entries()]
    .filter(([, h]) => h > 0)
    .map(([code, h]) => ({
      code,
      label: code === 'non_renseigne' ? 'Spécialité non renseignée' : (NSF_LABEL.get(code) ?? code),
      heures: h,
    }))
    .sort((a, b) => b.heures - a.heures);

  // Formateurs intervenus (internes / externes).
  let internes = 0;
  let externes = 0;
  if (dossierIds.length > 0) {
    const { data: dtRows } = await sb
      .schema('app')
      .from('dossier_trainers')
      .select('trainer_id, dossier_id, trainer:trainers(is_internal)')
      .in('dossier_id', dossierIds);
    const seen = new Map<string, boolean>();
    for (const r of (dtRows ?? []) as unknown as Array<{
      trainer_id: string | null;
      trainer: { is_internal: boolean } | null;
    }>) {
      if (r.trainer_id && !seen.has(r.trainer_id)) seen.set(r.trainer_id, r.trainer?.is_internal ?? true);
    }
    for (const isInternal of seen.values()) isInternal ? internes++ : externes++;
  }

  // Charges — dépenses des dossiers de l'année (par date de charge, ou non datées
  // rattachées à un dossier de l'année).
  let charges = buildBpfCharges([]);
  if (dossierIds.length > 0) {
    const { data: expRows } = await sb
      .schema('app')
      .from('dossier_expenses')
      .select('kind, amount_cents, hours, incurred_on')
      .in('dossier_id', dossierIds)
      .is('deleted_at', null);
    const expenses = ((expRows ?? []) as Array<{
      kind: string;
      amount_cents: number;
      hours: number | null;
      incurred_on: string | null;
    }>)
      .filter((e) => e.incurred_on == null || (e.incurred_on >= start && e.incurred_on <= end))
      .map((e) => ({ kind: e.kind, amountCents: e.amount_cents, hours: e.hours }));
    charges = buildBpfCharges(expenses);
  }

  return {
    financial,
    pedago: { stagiaires, heures, actions, dossiers: dossiers.length },
    formateurs: { internes, externes, total: internes + externes },
    byCategory,
    byActionType,
    byNsf,
    charges,
  };
}
