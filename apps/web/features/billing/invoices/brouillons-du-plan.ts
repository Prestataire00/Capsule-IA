import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { montantCouvertCents, estStatutFinancement } from '@/features/billing/domain/funding-status';
import type { FunderAllocationInput } from '@/features/billing/domain/billing-plan';
import { reaffecterBrouillons, type FactureDuDossier } from '@/features/billing/domain/brouillons-financeurs';
import { PROVISIONAL_PREFIX } from '@/features/billing/quotes/quote-service';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Sb = SupabaseClient<any, any, any>;

type Ligne = { id: string; description: string; quantity: number; unit_amount_cents: number; vat_rate: number };
type Facture = {
  id: string;
  organization_id: string;
  funder_id: string | null;
  company_id: string | null;
  quote_id: string | null;
  subtotal_cents: number;
  status: string;
  kind: string;
  currency: string;
  due_at: string | null;
  payment_terms: string | null;
};

const montants = (subtotal: number, tauxTva: number) => {
  const vat = Math.round(subtotal * (tauxTva / 100));
  return { subtotal_cents: subtotal, vat_cents: vat, total_cents: subtotal + vat };
};

/**
 * Un seul brouillon par financeur : celui qu'on lui transfère rejoint le sien
 * s'il en a déjà un. Le brouillon du devis survit (le devis y renvoie), l'autre
 * est retiré. Faux quand la fusion ne s'applique pas (pas de brouillon en
 * face, ou plusieurs lignes) : le transfert simple prend le relais.
 */
async function fusionner(sb: Sb, factures: Facture[], invoiceId: string, funderId: string, erreurs: string[]): Promise<boolean> {
  const arrivant = factures.find((f) => f.id === invoiceId);
  const enPlace = factures.find(
    (f) => f.id !== invoiceId && f.funder_id === funderId && f.status === 'draft' && (f.kind === 'invoice' || f.kind === 'balance'),
  );
  if (!arrivant || !enPlace) return false;
  const [garde, retire] = arrivant.quote_id && !enPlace.quote_id ? [arrivant, enPlace] : [enPlace, arrivant];
  const { data: l } = await sb
    .schema('app')
    .from('invoice_lines')
    .select('id, invoice_id, vat_rate')
    .in('invoice_id', [garde.id, retire.id]);
  const lignes = (l ?? []) as Array<{ id: string; invoice_id: string; vat_rate: number }>;
  const ligne = lignes.find((x) => x.invoice_id === garde.id);
  if (lignes.length !== 2 || !ligne) return false;
  const somme = Number(garde.subtotal_cents) + Number(retire.subtotal_cents);
  const maintenant = new Date().toISOString();
  const { error: e1 } = await sb.schema('app').from('invoice_lines').update({ quantity: 1, unit_amount_cents: somme } as never).eq('id', ligne.id);
  const { error: e2 } = e1
    ? { error: e1 }
    : await sb
        .schema('app')
        .from('invoices')
        .update({ funder_id: funderId, ...montants(somme, Number(ligne.vat_rate)), updated_at: maintenant } as never)
        .eq('id', garde.id)
        .eq('status', 'draft');
  const { error: e3 } = e2
    ? { error: e2 }
    : await sb.schema('app').from('invoices').update({ deleted_at: maintenant, updated_at: maintenant } as never).eq('id', retire.id).eq('status', 'draft');
  if (e3) {
    erreurs.push(`fusion des brouillons ${garde.id} / ${retire.id} : ${e3.message}`);
    return true;
  }
  garde.funder_id = funderId;
  garde.subtotal_cents = somme;
  retire.status = 'merged';
  return true;
}

/**
 * Aligne les factures brouillon du dossier sur son plan de financement, après
 * chaque changement d'un financeur (voir brouillons-financeurs.ts). Écrit avec
 * le client de l'appelant : la RLS des factures s'applique. Une facture de
 * devis partagé entre plusieurs dossiers n'est pas touchée : elle se répartit
 * sur tout le lot.
 */
export async function alignerBrouillonsSurLePlan(sb: Sb, dossierId: string): Promise<{ erreurs: string[] }> {
  const erreurs: string[] = [];
  const [{ data: d }, { data: fin }, { data: inv }] = await Promise.all([
    sb.schema('app').from('dossiers').select('total_amount_cents').eq('id', dossierId).maybeSingle(),
    sb.schema('app').from('dossier_funders').select('funder_id, amount_cents, granted_cents, status').eq('dossier_id', dossierId),
    sb
      .schema('app')
      .from('invoices')
      .select('id, organization_id, funder_id, company_id, quote_id, subtotal_cents, status, kind, currency, due_at, payment_terms')
      .eq('dossier_id', dossierId)
      .is('deleted_at', null),
  ]);
  const total = (d as { total_amount_cents: number | null } | null)?.total_amount_cents ?? 0;
  const factures = (inv ?? []) as Facture[];
  if (!total || factures.length === 0) return { erreurs };

  const devis = [...new Set(factures.map((f) => f.quote_id).filter((q): q is string => Boolean(q)))];
  const { data: liens } = devis.length
    ? await sb.schema('app').from('quote_dossiers').select('quote_id').in('quote_id', devis)
    : { data: [] };
  const parDevis = new Map<string, number>();
  for (const l of (liens ?? []) as Array<{ quote_id: string }>) parDevis.set(l.quote_id, (parDevis.get(l.quote_id) ?? 0) + 1);
  const partagee = (f: Facture) => Boolean(f.quote_id && (parDevis.get(f.quote_id) ?? 0) > 1);
  if (factures.some(partagee)) return { erreurs };

  const allocations: FunderAllocationInput[] = (
    (fin ?? []) as Array<{ funder_id: string; amount_cents: number; granted_cents: number | null; status: string }>
  ).map((f) => {
    const statut = estStatutFinancement(f.status) ? f.status : 'pending';
    return {
      funderId: f.funder_id,
      name: '',
      kind: '',
      allocatedHtCents: montantCouvertCents(statut, f.amount_cents, f.granted_cents),
      status: f.status as FunderAllocationInput['status'],
    };
  });
  const entrees: FactureDuDossier[] = factures.map((f) => ({
    id: f.id,
    funderId: f.funder_id,
    subtotalHtCents: Number(f.subtotal_cents),
    status: f.status,
    kind: f.kind,
  }));

  for (const r of reaffecterBrouillons(total, allocations, entrees)) {
    if (r.type === 'transferer' && r.funderId && (await fusionner(sb, factures, r.invoiceId, r.funderId, erreurs))) continue;
    if (r.type === 'transferer') {
      const { error } = await sb
        .schema('app')
        .from('invoices')
        .update({ funder_id: r.funderId, updated_at: new Date().toISOString() } as never)
        .eq('id', r.invoiceId)
        .eq('status', 'draft');
      if (error) erreurs.push(`brouillon ${r.invoiceId} : ${error.message}`);
      continue;
    }

    // Scinder : le brouillon garde la part de l'entreprise, un nouveau
    // brouillon porte celle du financeur. Une seule ligne, sinon on ne sait
    // pas quoi répartir : on laisse en l'état.
    const source = factures.find((f) => f.id === r.invoiceId);
    const { data: l } = await sb
      .schema('app')
      .from('invoice_lines')
      .select('id, description, quantity, unit_amount_cents, vat_rate')
      .eq('invoice_id', r.invoiceId);
    const lignes = (l ?? []) as Ligne[];
    const ligne = lignes[0];
    if (!source || lignes.length !== 1 || !ligne) {
      erreurs.push(`brouillon ${r.invoiceId} : plusieurs lignes, à répartir à la main`);
      continue;
    }
    const taux = Number(ligne.vat_rate);
    const { error: e1 } = await sb
      .schema('app')
      .from('invoice_lines')
      .update({ quantity: 1, unit_amount_cents: r.garderHtCents } as never)
      .eq('id', ligne.id);
    const { error: e2 } = e1
      ? { error: e1 }
      : await sb
          .schema('app')
          .from('invoices')
          .update({ ...montants(r.garderHtCents, taux), updated_at: new Date().toISOString() } as never)
          .eq('id', r.invoiceId)
          .eq('status', 'draft');
    if (e2) {
      erreurs.push(`brouillon ${r.invoiceId} : ${e2.message}`);
      continue;
    }
    // Le nouveau brouillon ne porte pas le devis : la facture de solde du
    // devis reste celle de l'entreprise.
    const { data: nouvelle, error: e3 } = await sb
      .schema('app')
      .from('invoices')
      .insert({
        organization_id: source.organization_id,
        reference: `${PROVISIONAL_PREFIX}${Date.now().toString(36).toUpperCase()}`,
        kind: 'invoice',
        dossier_id: dossierId,
        funder_id: r.funderId,
        company_id: source.company_id,
        status: 'draft',
        due_at: source.due_at,
        payment_terms: source.payment_terms,
        currency: source.currency,
        ...montants(r.transfereHtCents, taux),
      } as never)
      .select('id')
      .single();
    if (e3 || !nouvelle) {
      erreurs.push(`brouillon du financeur : ${e3?.message ?? 'non créé'}`);
      continue;
    }
    const { error: e4 } = await sb.schema('app').from('invoice_lines').insert({
      organization_id: source.organization_id,
      invoice_id: (nouvelle as { id: string }).id,
      position: 0,
      description: ligne.description,
      quantity: 1,
      unit_amount_cents: r.transfereHtCents,
      vat_rate: taux,
    } as never);
    if (e4) erreurs.push(`ligne du brouillon du financeur : ${e4.message}`);
  }
  return { erreurs };
}
