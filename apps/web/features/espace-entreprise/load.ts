import 'server-only';
import { supabaseAdmin } from '@/shared/lib/supabase/admin';
import { exigerLecture } from '@/shared/lib/supabase/echec-lecture';
import { loadOrgLogoDataUri } from '@/features/documents/load-org-branding';
import { etatFacture, type StatutFacture } from './statut-facture';

/**
 * Ce que voit le référent d'un client dans son espace (0207) : ses dossiers
 * — ceux dont il est le référent — et, pour chacun, les seuls documents que
 * l'organisme a rendus visibles. Lecture en service role, après vérification
 * du lien : le contact et l'organisme viennent du jeton, jamais de l'URL.
 */

export type DocumentEntreprise = {
  readonly id: string;
  readonly title: string;
  readonly kind: string;
  readonly createdAt: string;
  readonly aUnFichier: boolean;
};

export type DossierEntreprise = {
  readonly id: string;
  readonly reference: string;
  readonly formation: string | null;
  readonly debut: string | null;
  readonly fin: string | null;
  readonly documents: readonly DocumentEntreprise[];
};

export type EspaceEntreprise = {
  readonly referent: string;
  readonly entreprise: string | null;
  readonly organisme: string;
  readonly logo: string | null;
  readonly dossiers: readonly DossierEntreprise[];
};

export async function chargerEspaceEntreprise(contactId: string, organizationId: string): Promise<EspaceEntreprise | null> {
  const admin = supabaseAdmin();
  const [{ data: contact, error: e1 }, { data: org }] = await Promise.all([
    admin.schema('app').from('contacts').select('first_name, last_name, company:companies(name)').eq('id', contactId).maybeSingle(),
    admin.schema('app').from('organizations').select('name').eq('id', organizationId).maybeSingle(),
  ]);
  exigerLecture('contact de l’espace entreprise', e1);
  if (!contact) return null;
  const c = contact as unknown as {
    first_name: string | null;
    last_name: string | null;
    company: { name: string | null } | Array<{ name: string | null }> | null;
  };
  const entreprise = Array.isArray(c.company) ? (c.company[0]?.name ?? null) : (c.company?.name ?? null);

  const { data: dossiers, error: e2 } = await admin
    .schema('app')
    .from('dossiers')
    .select('id, reference, start_date, end_date, formation:formations(title)')
    .eq('organization_id', organizationId)
    .eq('contact_id' as never, contactId as never)
    .is('deleted_at', null)
    .order('start_date', { ascending: false });
  exigerLecture('dossiers de l’espace entreprise', e2);
  const lignes = (dossiers ?? []) as unknown as Array<{
    id: string;
    reference: string;
    start_date: string | null;
    end_date: string | null;
    formation: { title: string | null } | Array<{ title: string | null }> | null;
  }>;

  const ids = lignes.map((d) => d.id);
  const { data: docs, error: e3 } = ids.length
    ? await admin
        .schema('app')
        .from('documents')
        .select('id, dossier_id, title, kind, created_at, storage_path, content_html')
        .in('dossier_id', ids)
        .eq('visible_entreprise' as never, true as never)
        .eq('is_current' as never, true as never)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
    : { data: [], error: null };
  exigerLecture('documents de l’espace entreprise', e3);
  const parDossier = new Map<string, DocumentEntreprise[]>();
  for (const d of (docs ?? []) as unknown as Array<{
    id: string;
    dossier_id: string;
    title: string;
    kind: string;
    created_at: string;
    storage_path: string | null;
    content_html: string | null;
  }>) {
    // Un document jamais enregistré (PDF produit à la volée) n'a rien à montrer.
    if (!d.storage_path && !d.content_html) continue;
    parDossier.set(d.dossier_id, [
      ...(parDossier.get(d.dossier_id) ?? []),
      { id: d.id, title: d.title, kind: d.kind, createdAt: d.created_at, aUnFichier: Boolean(d.storage_path) },
    ]);
  }

  return {
    referent: `${c.first_name ?? ''} ${c.last_name ?? ''}`.trim() || 'Référent',
    entreprise,
    organisme: (org as { name: string | null } | null)?.name ?? 'Votre organisme de formation',
    logo: await loadOrgLogoDataUri(admin, organizationId),
    dossiers: lignes.map((d) => ({
      id: d.id,
      reference: d.reference,
      formation: Array.isArray(d.formation) ? (d.formation[0]?.title ?? null) : (d.formation?.title ?? null),
      debut: d.start_date,
      fin: d.end_date,
      documents: parDossier.get(d.id) ?? [],
    })),
  };
}

/**
 * Un document que ce référent a le droit d'ouvrir : visible pour
 * l'entreprise, et rattaché à un dossier dont il est le référent.
 */
export async function documentDuReferent(
  contactId: string,
  organizationId: string,
  documentId: string,
): Promise<{ title: string; storagePath: string | null; contentHtml: string | null } | null> {
  const admin = supabaseAdmin();
  const { data, error } = await admin
    .schema('app')
    .from('documents')
    .select('title, storage_path, content_html, dossier_id, organization_id, visible_entreprise, deleted_at')
    .eq('id', documentId)
    .maybeSingle();
  exigerLecture('document de l’espace entreprise', error);
  const d = data as unknown as {
    title: string;
    storage_path: string | null;
    content_html: string | null;
    dossier_id: string | null;
    organization_id: string;
    visible_entreprise: boolean;
    deleted_at: string | null;
  } | null;
  if (!d || d.deleted_at || !d.visible_entreprise || !d.dossier_id || d.organization_id !== organizationId) return null;

  const { data: dossier } = await admin
    .schema('app')
    .from('dossiers')
    .select('contact_id')
    .eq('id', d.dossier_id)
    .is('deleted_at', null)
    .maybeSingle();
  if ((dossier as { contact_id: string | null } | null)?.contact_id !== contactId) return null;
  return { title: d.title, storagePath: d.storage_path, contentHtml: d.content_html };
}

export type FactureEntreprise = {
  readonly id: string;
  readonly reference: string;
  readonly nature: 'facture' | 'acompte' | 'solde' | 'avoir';
  readonly statut: StatutFacture;
  readonly emiseLe: string | null;
  readonly echeance: string | null;
  readonly totalCents: number;
  readonly resteCents: number;
  readonly dossierReference: string;
};

const NATURE: Record<string, FactureEntreprise['nature']> = { invoice: 'facture', deposit: 'acompte', balance: 'solde', credit_note: 'avoir' };

/**
 * Les factures adressées à l'entreprise sur les dossiers dont il est le
 * référent (point Capsule IA du 05/10/2026) : ni brouillon, ni facture
 * annulée, ni celles adressées à un financeur. Ce qui reste à payer se lit
 * d'après les règlements enregistrés.
 */
export async function facturesDuReferent(contactId: string, organizationId: string): Promise<FactureEntreprise[]> {
  const admin = supabaseAdmin();
  const { data: dossiers, error: e1 } = await admin
    .schema('app')
    .from('dossiers')
    .select('id, reference')
    .eq('organization_id', organizationId)
    .eq('contact_id' as never, contactId as never)
    .is('deleted_at', null);
  exigerLecture('dossiers du référent', e1);
  const refs = new Map(((dossiers ?? []) as Array<{ id: string; reference: string }>).map((d) => [d.id, d.reference]));
  if (refs.size === 0) return [];

  const { data: inv, error: e2 } = await admin
    .schema('app')
    .from('invoices')
    .select('id, reference, kind, status, issued_at, due_at, total_cents, dossier_id')
    .eq('organization_id', organizationId)
    .in('dossier_id', [...refs.keys()])
    .is('funder_id', null)
    .is('deleted_at', null)
    .not('status', 'in', '(draft,cancelled)')
    .order('issued_at', { ascending: false, nullsFirst: false });
  exigerLecture('factures du référent', e2);
  const factures = (inv ?? []) as unknown as Array<{
    id: string;
    reference: string;
    kind: string | null;
    status: string;
    issued_at: string | null;
    due_at: string | null;
    total_cents: number;
    dossier_id: string;
  }>;
  if (factures.length === 0) return [];

  const { data: pay, error: e3 } = await admin.schema('app').from('payments').select('invoice_id, amount_cents').in('invoice_id', factures.map((f) => f.id));
  exigerLecture('règlements du référent', e3);
  const regle = new Map<string, number>();
  for (const p of (pay ?? []) as Array<{ invoice_id: string; amount_cents: number }>) regle.set(p.invoice_id, (regle.get(p.invoice_id) ?? 0) + Number(p.amount_cents));

  const aujourdHui = new Date().toISOString().slice(0, 10);
  return factures.map((f) => {
    const { statut, resteCents } = etatFacture(
      { kind: f.kind, status: f.status, totalCents: Number(f.total_cents), regleCents: regle.get(f.id) ?? 0, echeance: f.due_at },
      aujourdHui,
    );
    return {
      id: f.id,
      reference: f.reference,
      nature: NATURE[f.kind ?? 'invoice'] ?? 'facture',
      statut,
      emiseLe: f.issued_at,
      echeance: f.due_at,
      totalCents: Number(f.total_cents),
      resteCents,
      dossierReference: refs.get(f.dossier_id) ?? '',
    };
  });
}

/** Une facture que ce référent a le droit d'ouvrir : la même règle que la liste. */
export async function factureDuReferent(contactId: string, organizationId: string, invoiceId: string): Promise<boolean> {
  return (await facturesDuReferent(contactId, organizationId)).some((f) => f.id === invoiceId);
}
