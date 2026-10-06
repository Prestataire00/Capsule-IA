import 'server-only';
import { supabaseAdmin } from '@/shared/lib/supabase/admin';
import { exigerLecture } from '@/shared/lib/supabase/echec-lecture';
import { loadOrgLogoDataUri } from '@/features/documents/load-org-branding';
import { etatFacture, type StatutFacture } from './statut-facture';
import { replaysDesSeances } from '@/features/sessions/replays-store';
import { LIBELLE_SOURCE } from '@/features/sessions/replays';

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
  /** Les replays (tl;dv, Lexi…) des séances du dossier. */
  readonly replays: ReadonlyArray<{ id: string; titre: string; url: string; source: string }>;
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

  // Les replays des séances de ces dossiers, par leurs deux chemins.
  const [{ data: directes }, { data: liees }] = ids.length
    ? await Promise.all([
        admin.schema('app').from('sessions').select('id, dossier_id, starts_at').in('dossier_id', ids).neq('status', 'cancelled'),
        admin.schema('app').from('session_dossiers').select('dossier_id, session:sessions!inner(id, starts_at, status)').in('dossier_id', ids),
      ])
    : [{ data: [] }, { data: [] }];
  const seancesDe = new Map<string, Array<{ id: string; debut: string }>>();
  for (const s of (directes ?? []) as Array<{ id: string; dossier_id: string; starts_at: string }>) {
    seancesDe.set(s.dossier_id, [...(seancesDe.get(s.dossier_id) ?? []), { id: s.id, debut: s.starts_at }]);
  }
  for (const l of (liees ?? []) as unknown as Array<{ dossier_id: string; session: { id: string; starts_at: string; status: string } | Array<{ id: string; starts_at: string; status: string }> | null }>) {
    const se = Array.isArray(l.session) ? l.session[0] : l.session;
    if (!se || se.status === 'cancelled') continue;
    const liste = seancesDe.get(l.dossier_id) ?? [];
    if (!liste.some((x) => x.id === se.id)) seancesDe.set(l.dossier_id, [...liste, { id: se.id, debut: se.starts_at }]);
  }
  const replays = await replaysDesSeances([...new Set([...seancesDe.values()].flat().map((x) => x.id))]);
  const jourSeance = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', day: '2-digit', month: '2-digit' });
  const replaysDe = (dossierId: string) =>
    (seancesDe.get(dossierId) ?? [])
      .sort((a, b) => a.debut.localeCompare(b.debut))
      .flatMap((se) =>
        (replays.get(se.id) ?? []).map((r) => ({
          id: r.id,
          titre: r.titre || `Séance du ${jourSeance.format(new Date(se.debut))}`,
          url: r.url,
          source: LIBELLE_SOURCE[r.source],
        })),
      );

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
      replays: replaysDe(d.id),
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
