import 'server-only';
// Le devis de la proposition active suit la demande quand elle devient client.
//
// Qu'elle soit convertie par la signature du devis ou à la main (« Convertir en
// client »), la demande devient un dossier : son devis doit le couvrir, sans
// quoi le dossier en créerait un second et la facture partirait de celui-là.

import type { SupabaseClient } from '@supabase/supabase-js';

export async function rattacherDevisDeProposition(sb: SupabaseClient, prospectId: string, dossierId: string): Promise<void> {
  const { data: pRow } = await sb
    .schema('app')
    .from('propositions')
    .select('id, quote_id, document_id, organization_id')
    .eq('prospect_id', prospectId)
    .in('statut', ['active', 'acceptee'])
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle();
  const p = pRow as { id: string; quote_id: string | null; document_id: string | null; organization_id: string } | null;
  if (!p) return;

  const { data: dRow } = await sb.schema('app').from('dossiers').select('learner_id, company_id').eq('id', dossierId).maybeSingle();
  const d = dRow as { learner_id: string; company_id: string | null } | null;
  if (!d) return;

  if (p.quote_id) {
    const { error } = await sb
      .schema('app')
      .from('quote_dossiers')
      .upsert({ quote_id: p.quote_id, dossier_id: dossierId, organization_id: p.organization_id } as never, { onConflict: 'quote_id,dossier_id' });
    if (error) console.error('[proposition] devis non rattaché au dossier', p.quote_id, error.message);
    // Le client du devis devient l'entreprise ou l'apprenant enregistrés.
    await sb
      .schema('app')
      .from('quotes')
      .update((d.company_id ? { company_id: d.company_id, client_kind: 'company' } : { learner_id: d.learner_id, client_kind: 'individual' }) as never)
      .eq('id', p.quote_id);
    await sb.schema('app').from('documents').update({ dossier_id: dossierId } as never).eq('metadata->>quote_id', p.quote_id).is('dossier_id', null);
  }
  // La proposition rejoint les documents du dossier : c'est son programme.
  if (p.document_id) {
    await sb.schema('app').from('documents').update({ dossier_id: dossierId } as never).eq('id', p.document_id).is('dossier_id', null);
  }
}
