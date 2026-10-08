import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '@/shared/lib/supabase/admin';
import { loadOrgBranding } from '@/features/documents/load-org-branding';
import { genererDevisPdf } from '@/features/documents/generate-devis-pdf';
import { construirePdfSigneDepuis, signaturesDuDocument } from '@/features/documents/document-signe';
import { donneesDuDevis } from './quote-service';

/**
 * Le devis en PDF, et signé quand il l'est : le document seul, suivi du
 * certificat de signature électronique. L'appelant a vérifié l'accès (équipe
 * sous ses droits, référent par son lien).
 */
export async function pdfDuDevis(quoteId: string): Promise<{ pdf: Uint8Array; nom: string; signe: boolean } | null> {
  const sb = supabaseAdmin();
  const donnees = await donneesDuDevis(sb as never, quoteId);
  if (!donnees) return null;
  const { input, quote } = donnees;
  const branding = await loadOrgBranding(sb as never, quote.organization_id);
  let pdf = await genererDevisPdf(input, branding.logoPng);
  const signatures = quote.document_id ? await signaturesDuDocument(sb as unknown as SupabaseClient, quote.document_id) : [];
  const signe = signatures.length > 0;
  if (signe && quote.document_id) {
    pdf = await construirePdfSigneDepuis(sb as unknown as SupabaseClient, pdf, { id: quote.document_id, title: `Devis ${quote.reference}` }, signatures);
  }
  const nom = `Devis ${quote.reference}${signe || quote.status === 'signed' ? ' - signe' : ''}.pdf`.replace(/[^\w .-]+/g, '-');
  return { pdf, nom, signe };
}
