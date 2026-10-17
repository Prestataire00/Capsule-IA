import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { encaissement, type Encaissement } from './domain/encaissement';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Client = SupabaseClient<any, any, any>;

/**
 * Encaissement de plusieurs dossiers, en trois requêtes. Les dossiers passés
 * ont déjà été lus sous RLS par l'appelant ; on lit ensuite leurs factures et
 * règlements avec le client fourni (service role côté liste : les factures
 * ne sont lisibles sous RLS que par la direction et la comptabilité).
 */
export async function chargerEncaissements(
  sb: Client,
  dossiers: ReadonlyArray<{ id: string; total_amount_cents: number | null }>,
): Promise<Map<string, Encaissement>> {
  const ids = dossiers.map((d) => d.id);
  if (ids.length === 0) return new Map();
  const [{ data: inv, error: e1 }, { data: regles }] = await Promise.all([
    sb.schema('app').from('invoices').select('id, dossier_id, status, kind, total_cents').in('dossier_id', ids).is('deleted_at', null),
    sb.schema('app').from('dossiers').select('id, regle_hors_crm_at').in('id', ids).not('regle_hors_crm_at', 'is', null),
  ]);
  if (e1) console.error('[encaissements] factures illisibles', e1.message);
  const factures = (inv ?? []) as Array<{ id: string; dossier_id: string; status: string; kind: string; total_cents: number | string }>;
  const { data: pay } = factures.length
    ? await sb.schema('app').from('payments').select('invoice_id, amount_cents').in('invoice_id', factures.map((f) => f.id))
    : { data: [] };
  const paye = new Map<string, number>();
  for (const p of (pay ?? []) as Array<{ invoice_id: string; amount_cents: number | string }>) {
    paye.set(p.invoice_id, (paye.get(p.invoice_id) ?? 0) + Number(p.amount_cents));
  }
  const horsCrm = new Set(((regles ?? []) as Array<{ id: string }>).map((r) => r.id));
  return new Map(
    dossiers.map((d) => [
      d.id,
      encaissement({
        totalDossierCents: d.total_amount_cents,
        regleHorsCrm: horsCrm.has(d.id),
        factures: factures
          .filter((f) => f.dossier_id === d.id)
          .map((f) => ({
            status: f.status,
            kind: f.kind,
            totalCents: Number(f.total_cents),
            // Une facture marquée payée sans règlement saisi compte comme réglée.
            payeCents: f.status === 'paid' ? Math.max(Number(f.total_cents), paye.get(f.id) ?? 0) : (paye.get(f.id) ?? 0),
          })),
      }),
    ]),
  );
}
