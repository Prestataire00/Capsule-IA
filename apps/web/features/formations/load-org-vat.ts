import 'server-only';
import { supabaseServer } from '@/shared/lib/supabase/server';

export type OrgVat = { regime: 'exempt' | 'subject'; rate: number };

/**
 * Régime de TVA de l'organisme (Paramètres → Organisation). Sert de taux par
 * défaut aux tarifs du catalogue et aux nouvelles factures. Repli « exonéré »,
 * cas de la majorité des organismes de formation (art. 261-4-4°a CGI).
 */
export async function loadOrgVat(): Promise<OrgVat> {
  const sb = supabaseServer();
  const { data } = await sb
    .schema('app')
    .from('organizations')
    .select('vat_regime, default_vat_rate')
    .limit(1)
    .maybeSingle();

  const row = data as { vat_regime?: string | null; default_vat_rate?: number | null } | null;
  return {
    regime: row?.vat_regime === 'subject' ? 'subject' : 'exempt',
    rate: Number(row?.default_vat_rate ?? 0),
  };
}
