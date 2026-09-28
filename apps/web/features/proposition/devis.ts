import 'server-only';
// Le devis d'une proposition : il existe AVANT le dossier.
//
// Jusqu'ici un devis naissait d'un dossier. Une proposition, elle, s'adresse à
// une demande — pas encore un client : ni entreprise ni apprenant enregistrés.
// Le devis porte donc l'identité du client dans ses métadonnées, le temps que
// la signature fasse de la demande un client ; il est alors rattaché au
// dossier (rattacher-devis.ts).

import type { SupabaseClient } from '@supabase/supabase-js';
import { QUOTE_VALIDITY_DAYS, addDays } from '@/features/billing/domain/quote';
import { nextDocumentNumber, recomputeQuoteTotals, renderQuoteDocument } from '@/features/billing/quotes/quote-service';
import { lignesDevis, type ContenuProposition } from './contenu';

export type ClientDemande = {
  entreprise: boolean;
  nom: string;
  siret: string | null;
  adresse: string | null;
  destinataireNom: string | null;
  destinataireEmail: string | null;
};

const aujourdhuiParis = (): string =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

export async function creerDevisProposition(
  sb: SupabaseClient,
  args: { organizationId: string; prospectId: string; formationId: string | null; version: number; contenu: ContenuProposition; client: ClientDemande },
): Promise<{ ok: true; quoteId: string } | { ok: false; erreur: string }> {
  const [{ data: oRow }, reference] = await Promise.all([
    sb.schema('app').from('organizations').select('vat_regime, default_vat_rate').eq('id', args.organizationId).maybeSingle(),
    nextDocumentNumber(sb, args.organizationId, 'DEV'),
  ]);
  if (!reference) return { ok: false, erreur: 'numérotation du devis impossible' };
  const org = (oRow ?? {}) as { vat_regime?: string | null; default_vat_rate?: number | null };
  const emis = aujourdhuiParis();

  const { data, error } = await sb
    .schema('app')
    .from('quotes')
    .insert({
      organization_id: args.organizationId,
      reference,
      status: 'draft',
      client_kind: args.client.entreprise ? 'company' : 'individual',
      formation_id: args.formationId,
      recipient_name: args.client.destinataireNom,
      recipient_email: args.client.destinataireEmail,
      object: args.contenu.titre,
      issued_on: emis,
      valid_until: addDays(emis, QUOTE_VALIDITY_DAYS),
      vat_rate: org.vat_regime === 'subject' ? Number(org.default_vat_rate ?? 0) : 0,
      auto_generated: true,
      metadata: {
        prospect_id: args.prospectId,
        proposition_version: args.version,
        formation_title: args.contenu.titre,
        client: { name: args.client.nom, siret: args.client.siret, address: args.client.adresse },
      },
    } as never)
    .select('id')
    .single();
  if (error || !data) return { ok: false, erreur: error?.message ?? 'devis non créé' };
  const quoteId = (data as { id: string }).id;

  const { error: lErr } = await sb
    .schema('app')
    .from('quote_lines')
    .insert(
      lignesDevis(args.contenu).map((l, position) => ({
        organization_id: args.organizationId,
        quote_id: quoteId,
        position,
        description: l.description,
        details: l.details,
        quantity: l.quantite,
        unit_amount_cents: l.prixUnitaireCents,
        vat_rate: null,
      })) as never,
    );
  if (lErr) return { ok: false, erreur: lErr.message };

  await recomputeQuoteTotals(sb, quoteId);
  await renderQuoteDocument(sb, quoteId);
  return { ok: true, quoteId };
}
