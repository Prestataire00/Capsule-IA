import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/shared/types/database';
import { countByKind } from './funders-overview';

export type FunderRow = {
  id: string;
  kind: string;
  name: string;
  contactEmail: string | null;
  fundedCents: number;
  dossierCount: number;
};

export type FundersOverview = {
  funders: FunderRow[];
  totalFunders: number;
  byKind: Record<string, number>;
  grandTotalCents: number;
};

const FUNDED_STATUSES = new Set(['active', 'completed', 'closed']);
const ACTIVE_STATUSES = new Set(['active', 'scheduled']);

// Vue d'ensemble des financeurs de l'org (RLS) : montant financé + dossiers actifs par financeur.
export async function getFundersOverview(sb: SupabaseClient<Database>): Promise<FundersOverview> {
  const { data: fData } = await sb
    .schema('app')
    .from('funders')
    .select('id, kind, name, contact_email')
    .is('deleted_at', null)
    .order('name', { ascending: true });
  const funders = (fData ?? []) as unknown as Array<{ id: string; kind: string; name: string; contact_email: string | null }>;

  const { data: dfData } = await sb
    .schema('app')
    .from('dossier_funders')
    .select('funder_id, amount_cents, dossiers(status)');
  const links = (dfData ?? []) as unknown as Array<{
    funder_id: string;
    amount_cents: number | null;
    dossiers: { status: string } | null;
  }>;

  const agg = new Map<string, { funded: number; active: number }>();
  for (const l of links) {
    const status = l.dossiers?.status;
    const e = agg.get(l.funder_id) ?? { funded: 0, active: 0 };
    if (status && FUNDED_STATUSES.has(status)) e.funded += Number(l.amount_cents ?? 0);
    if (status && ACTIVE_STATUSES.has(status)) e.active += 1;
    agg.set(l.funder_id, e);
  }

  const rows: FunderRow[] = funders.map((f) => {
    const e = agg.get(f.id);
    return {
      id: f.id,
      kind: f.kind,
      name: f.name,
      contactEmail: f.contact_email,
      fundedCents: e?.funded ?? 0,
      dossierCount: e?.active ?? 0,
    };
  });

  return {
    funders: rows,
    totalFunders: rows.length,
    byKind: countByKind(funders.map((f) => f.kind)),
    grandTotalCents: rows.reduce((acc, r) => acc + r.fundedCents, 0),
  };
}
