import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { env } from '@/env.mjs';
import { supabaseAdmin } from '@/shared/lib/supabase/admin';
import { sendEmail } from '@/shared/lib/email/resend';
import { loadSessionsByIds } from '@/features/trainer-space/my-sessions';
import { adresseLignes, estTarifBase, ligneSeance, type LigneCalculee, type TarifBase } from '@/features/trainer-space/billing-rules';

/**
 * Facturation des formateurs, côté serveur : profil, fiche dans un organisme,
 * séances facturables (terminées, pas encore facturées) et notifications.
 * Appelé uniquement après une garde (compte formateur, ou membre « facturation »).
 */

// Tables récentes, absentes des types générés.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Libre = SupabaseClient<any, any, any>;
export const libre = (c: unknown) => c as Libre;

export const BILLING_BUCKET = 'trainer-billing';
const JOUR_MS = 24 * 60 * 60 * 1000;

export type BillingProfile = {
  user_id: string;
  legal_name: string | null;
  address_line: string | null;
  postal_code: string | null;
  city: string | null;
  country: string;
  siret: string | null;
  vat_regime: 'franchise' | 'assujetti';
  vat_rate: number;
  vat_number: string | null;
  iban: string | null;
  bic: string | null;
  invoice_prefix: string;
  next_invoice_number: number;
};

export async function loadBillingProfile(userId: string): Promise<BillingProfile | null> {
  const { data } = await libre(supabaseAdmin()).schema('app').from('trainer_billing_profiles').select('*').eq('user_id', userId).maybeSingle();
  return (data as BillingProfile | null) ?? null;
}

export const profilComplet = (p: BillingProfile | null): p is BillingProfile =>
  Boolean(p?.legal_name && p.address_line && p.postal_code && p.city && p.siret);

export type TrainerFiche = {
  id: string;
  organization_id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  tarif_base: TarifBase | null;
  tarif_cents: number | null;
};

/** Fiche formateur ouverte du compte dans cet organisme. */
export async function ficheDansOrganisme(userId: string, organizationId: string): Promise<TrainerFiche | null> {
  const { data } = await libre(supabaseAdmin())
    .schema('app')
    .from('trainers')
    .select('id, organization_id, first_name, last_name, email, tarif_base, tarif_cents')
    .eq('user_id', userId)
    .eq('organization_id', organizationId)
    .is('deleted_at', null)
    .is('space_disabled_at', null)
    .maybeSingle();
  const f = data as (Omit<TrainerFiche, 'tarif_base'> & { tarif_base: string | null }) | null;
  if (!f) return null;
  return { ...f, tarif_base: estTarifBase(f.tarif_base) ? f.tarif_base : null, tarif_cents: f.tarif_cents === null ? null : Number(f.tarif_cents) };
}

export type Facturable = {
  fiche: TrainerFiche;
  lignes: LigneCalculee[];
  /** Séances terminées sans tarif applicable (fiche ou séance). */
  sansTarif: { id: string; title: string; startsAt: string }[];
};

/** Séances terminées du formateur dans cet organisme, pas encore sur une facture (hors refusée). */
export async function seancesFacturables(userId: string, organizationId: string): Promise<Facturable | null> {
  const fiche = await ficheDansOrganisme(userId, organizationId);
  if (!fiche) return null;
  const admin = libre(supabaseAdmin());
  const { data: ids, error } = await admin.schema('app').rpc('trainer_session_ids', { p_user_id: userId });
  if (error) throw error;
  const maintenant = Date.now();
  const seances = (
    await loadSessionsByIds(admin, (ids ?? []) as string[], { from: new Date(maintenant - 400 * JOUR_MS), to: new Date(maintenant) }, organizationId)
  ).filter((s) => s.status !== 'cancelled' && Date.parse(s.endsAt) <= maintenant);
  if (seances.length === 0) return { fiche, lignes: [], sansTarif: [] };
  const sessionIds = seances.map((s) => s.id);

  const [{ data: factures }, { data: particuliers }] = await Promise.all([
    admin.schema('app').from('trainer_invoices').select('id').eq('trainer_id', fiche.id).neq('status', 'refusee'),
    admin
      .schema('app')
      .from('session_trainers')
      .select('session_id, hourly_rate_cents, amount_cents')
      .eq('trainer_id', fiche.id)
      .in('session_id', sessionIds)
      .is('deleted_at', null),
  ]);
  const factureIds = ((factures ?? []) as { id: string }[]).map((f) => f.id);
  const { data: liees } = factureIds.length
    ? await admin.schema('app').from('trainer_invoice_sessions').select('session_id').in('invoice_id', factureIds)
    : { data: [] };
  const deja = new Set(((liees ?? []) as { session_id: string }[]).map((l) => l.session_id));
  const parSeance = new Map(
    ((particuliers ?? []) as { session_id: string; hourly_rate_cents: number | null; amount_cents: number | null }[]).map((p) => [p.session_id, p]),
  );

  const lignes: LigneCalculee[] = [];
  const sansTarif: Facturable['sansTarif'] = [];
  for (const s of seances) {
    if (deja.has(s.id)) continue;
    const p = parSeance.get(s.id);
    const ligne = ligneSeance(
      {
        id: s.id,
        title: s.title,
        startsAt: s.startsAt,
        endsAt: s.endsAt,
        forfaitCents: p?.amount_cents == null ? null : Number(p.amount_cents),
        tauxHoraireCents: p?.hourly_rate_cents == null ? null : Number(p.hourly_rate_cents),
      },
      fiche.tarif_base,
      fiche.tarif_cents,
    );
    if (ligne) lignes.push(ligne);
    else sansTarif.push({ id: s.id, title: s.title, startsAt: s.startsAt });
  }
  return { fiche, lignes, sansTarif };
}

export async function organisationClient(organizationId: string): Promise<{ name: string; addressLines: string[]; siret: string | null; contactEmail: string | null }> {
  const { data } = await libre(supabaseAdmin())
    .schema('app')
    .from('organizations')
    .select('name, legal_name, siret, address, contact_email')
    .eq('id', organizationId)
    .maybeSingle();
  const o = data as { name: string; legal_name: string | null; siret: string | null; address: unknown; contact_email: string | null } | null;
  return {
    name: o?.legal_name || o?.name || 'Organisme de formation',
    addressLines: adresseLignes(o?.address),
    siret: o?.siret ?? null,
    contactEmail: o?.contact_email ?? null,
  };
}

const echapper = (t: string) =>
  t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

function emailSimple(titre: string, paragraphes: readonly string[], lien?: { url: string; libelle: string }): string {
  return `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#fafafa;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#18181b;line-height:1.55;">
<div style="max-width:560px;margin:0 auto;padding:32px 24px;"><div style="background:#fff;border:1px solid #e4e4e7;border-radius:12px;padding:24px;">
<h1 style="font-size:17px;font-weight:600;margin:0 0 12px;">${echapper(titre)}</h1>
${paragraphes.map((p) => `<p style="font-size:14px;color:#52525b;margin:0 0 12px;">${echapper(p)}</p>`).join('')}
${lien ? `<a href="${lien.url}" style="display:inline-block;margin-top:8px;padding:10px 18px;background:#f97316;color:#fff;text-decoration:none;border-radius:8px;font-size:13px;font-weight:500;">${echapper(lien.libelle)}</a>` : ''}
</div><p style="font-size:11px;color:#a1a1aa;margin-top:24px;text-align:center;">Envoyé depuis Capsule IA.</p></div></body></html>`;
}

const base = () => (env.PUBLIC_APP_URL ?? '').replace(/\/$/, '');

/** Prévient l'organisme (adresse de contact) d'une facture ou d'une note de frais reçue. */
export async function prevenirOrganisme(organizationId: string, sujet: string, paragraphes: readonly string[]): Promise<void> {
  const { contactEmail } = await organisationClient(organizationId);
  if (!contactEmail) return;
  const r = await sendEmail({
    to: contactEmail,
    subject: sujet,
    html: emailSimple(sujet, paragraphes, base() ? { url: `${base()}/formateurs/facturation`, libelle: 'Ouvrir la facturation des formateurs' } : undefined),
    organizationId,
    kind: 'trainer_billing',
  });
  if (!r.ok) console.error('[facturation formateur] organisme non prévenu', r.reason);
}

/** Prévient le formateur d'une décision de l'organisme. */
export async function prevenirFormateur(
  email: string | null,
  organizationId: string,
  sujet: string,
  paragraphes: readonly string[],
  chemin: '/mes-factures' | '/mes-frais',
): Promise<void> {
  if (!email) return;
  const r = await sendEmail({
    to: email,
    subject: sujet,
    html: emailSimple(sujet, paragraphes, base() ? { url: `${base()}${chemin}`, libelle: 'Ouvrir mon espace formateur' } : undefined),
    organizationId,
    kind: 'trainer_billing',
  });
  if (!r.ok) console.error('[facturation formateur] formateur non prévenu', r.reason);
}
