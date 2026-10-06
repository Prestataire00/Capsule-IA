import 'server-only';
import { cleConvention } from '@/features/documents/convention-destinataire';
// Devis signé = proposition acceptée = la demande devient un client.
//
// Appelé par `markQuoteSigned`, que la signature soit électronique ou saisie à
// la main. La demande est convertie (apprenant, entreprise, dossier), le devis
// rattaché au dossier, puis les documents contractuels sont produits : la
// convention, et le programme — la proposition acceptée elle-même.

import type { SupabaseClient } from '@supabase/supabase-js';
import { convertProspectToDossier } from '@/features/crm/prospect-conversion/convert-core';
import { buildConventionInput } from '@/features/documents/build-convention-input';
import { generateConventionPDF } from '@/features/documents/generate-convention-pdf';
import { persistGeneratedDocument } from '@/features/documents/persist-document';
import { totalHtCents, type ContenuProposition } from './contenu';
import { rattacherDevisDeProposition } from './rattacher-devis';

export type AcceptationResultat =
  | { ok: true; dossierId: string; documents: string[] }
  | { ok: false; raison: 'pas_de_proposition' }
  | { ok: false; raison: 'conversion'; detail: string };

export async function accepterPropositionDuDevis(sb: SupabaseClient, quoteId: string): Promise<AcceptationResultat> {
  const { data } = await sb
    .schema('app')
    .from('propositions')
    .select('id, organization_id, prospect_id, version, contenu')
    .eq('quote_id', quoteId)
    .eq('statut', 'active')
    .maybeSingle();
  const prop = data as { id: string; organization_id: string; prospect_id: string; version: number; contenu: ContenuProposition } | null;
  if (!prop) return { ok: false, raison: 'pas_de_proposition' };

  // Une demande sans formation du catalogue devient une formation hors
  // catalogue, avec l'intitulé, la durée et le prix de la proposition acceptée.
  const { data: pRow } = await sb
    .schema('app')
    .from('prospects')
    .select('formation_id, custom_formation_title')
    .eq('id', prop.prospect_id)
    .maybeSingle();
  const pr = pRow as { formation_id: string | null; custom_formation_title: string | null } | null;
  if (pr && !pr.formation_id) {
    await sb
      .schema('app')
      .from('prospects')
      .update({
        custom_formation_title: prop.contenu.titre,
        custom_formation_hours: prop.contenu.duree_totale_heures || prop.contenu.tarif.heures || null,
        custom_formation_price_cents: totalHtCents(prop.contenu.tarif),
      } as never)
      .eq('id', prop.prospect_id);
  }

  const conv = await convertProspectToDossier(sb, prop.organization_id, prop.prospect_id);
  if (!conv.ok) {
    console.error('[proposition] conversion après signature impossible', prop.prospect_id, conv.error, conv.details);
    return { ok: false, raison: 'conversion', detail: conv.error };
  }
  const dossierId = conv.dossierId;

  await rattacherDevisDeProposition(sb, prop.prospect_id, dossierId);
  await sb.schema('app').from('propositions').update({ statut: 'acceptee', updated_at: new Date().toISOString() } as never).eq('id', prop.id);
  await sb.schema('app').from('prospect_events').insert({
    organization_id: prop.organization_id,
    prospect_id: prop.prospect_id,
    kind: 'proposition_acceptee',
    payload: { version: prop.version, quote_id: quoteId, dossier_id: dossierId },
  } as never);

  const documents: string[] = ['Programme (proposition acceptée)'];
  // La convention (ou le contrat, pour un particulier) : la pièce que le
  // client signe ensuite. Un échec ne défait pas la signature du devis.
  try {
    const built = await buildConventionInput(sb as never, dossierId, null);
    if (built) {
      const { data: d } = await sb.schema('app').from('dossiers').select('company_id').eq('id', dossierId).maybeSingle();
      const entreprise = Boolean((d as { company_id: string | null } | null)?.company_id);
      const input = entreprise
        ? { ...built.input, audience: 'entreprise' as const }
        : { ...built.input, contractKind: 'contrat' as const, audience: 'stagiaire' as const };
      const bytes = await generateConventionPDF(input);
      await persistGeneratedDocument(sb as never, {
        organizationId: built.organizationId,
        dossierId,
        kind: 'convention',
        title: entreprise ? `Convention de formation — ${prop.contenu.titre}` : `Contrat de formation professionnelle — ${prop.contenu.titre}`,
        bytes,
        generationInput: input,
        // Même clé que la convention générée depuis le dossier : pas de doublon.
        sourceKey: cleConvention(dossierId),
        metadata: { proposition_id: prop.id, quote_id: quoteId },
      });
      documents.push(entreprise ? 'Convention de formation' : 'Contrat de formation');
    }
  } catch (e) {
    console.error('[proposition] convention non générée', dossierId, e);
  }

  return { ok: true, dossierId, documents };
}
