import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Sb = SupabaseClient<any, any, any>;

export type DerniereSeance = {
  readonly estLaDerniere: boolean;
  readonly derniere: { id: string; debut: string } | null;
  readonly estLaPremiere: boolean;
  readonly premiere: { id: string; debut: string } | null;
};

/**
 * La première et la dernière séance du groupe de cette séance : celles du même groupe, sinon
 * celles de ses dossiers sans groupe, sinon celles de la même formation pour
 * le même client. Annulées exclues. Chez Sandaya, les groupes A et B partagent
 * un dossier : la dernière du dossier n'est pas celle de chaque groupe.
 */
export async function bornesDuGroupe(sb: Sb, sessionId: string): Promise<DerniereSeance> {
  const { data } = await sb
    .schema('app')
    .from('sessions')
    .select('id, starts_at, ends_at, groupe_id, dossier_id, formation_id, company_id, organization_id')
    .eq('id', sessionId)
    .maybeSingle();
  const s = data as {
    id: string;
    starts_at: string;
    ends_at: string;
    groupe_id: string | null;
    dossier_id: string | null;
    formation_id: string | null;
    company_id: string | null;
    organization_id: string;
  } | null;
  if (!s) return { estLaDerniere: false, derniere: null, estLaPremiere: false, premiere: null };

  type Ligne = { id: string; starts_at: string; ends_at: string };
  let soeurs: Ligne[] = [];
  if (s.groupe_id) {
    const { data: g } = await sb.schema('app').from('sessions').select('id, starts_at, ends_at').eq('groupe_id', s.groupe_id).neq('status', 'cancelled');
    soeurs = (g ?? []) as Ligne[];
  } else {
    const { data: liens } = await sb.schema('app').from('session_dossiers').select('dossier_id').eq('session_id', s.id);
    const dossierIds = [...new Set([s.dossier_id, ...((liens ?? []) as Array<{ dossier_id: string }>).map((l) => l.dossier_id)].filter((v): v is string => Boolean(v)))];
    if (dossierIds.length) {
      const [{ data: directes }, { data: liees }] = await Promise.all([
        sb.schema('app').from('sessions').select('id, starts_at, ends_at').in('dossier_id', dossierIds).is('groupe_id', null).neq('status', 'cancelled'),
        sb
          .schema('app')
          .from('session_dossiers')
          .select('session:sessions!inner(id, starts_at, ends_at, groupe_id, status)')
          .in('dossier_id', dossierIds),
      ]);
      const viaLiens = ((liees ?? []) as unknown as Array<{ session: (Ligne & { groupe_id: string | null; status: string }) | null }>)
        .map((l) => l.session)
        .filter((x): x is Ligne & { groupe_id: string | null; status: string } => Boolean(x && !x.groupe_id && x.status !== 'cancelled'));
      soeurs = [...((directes ?? []) as Ligne[]), ...viaLiens];
    } else {
      let q = sb.schema('app').from('sessions').select('id, starts_at, ends_at').eq('organization_id', s.organization_id).is('dossier_id', null).neq('status', 'cancelled');
      q = s.formation_id ? q.eq('formation_id', s.formation_id) : q.eq('id', s.id);
      q = s.company_id ? q.eq('company_id' as never, s.company_id as never) : q;
      const { data: libres } = await q;
      soeurs = (libres ?? []) as Ligne[];
    }
  }
  const toutes = [...new Map([...soeurs, { id: s.id, starts_at: s.starts_at, ends_at: s.ends_at }].map((x) => [x.id, x])).values()];
  const derniere = [...toutes].sort((a, b) => b.ends_at.localeCompare(a.ends_at))[0] ?? null;
  const premiere = [...toutes].sort((a, b) => a.starts_at.localeCompare(b.starts_at))[0] ?? null;
  return {
    estLaDerniere: derniere?.id === s.id,
    derniere: derniere ? { id: derniere.id, debut: derniere.starts_at } : null,
    estLaPremiere: premiere?.id === s.id,
    premiere: premiere ? { id: premiere.id, debut: premiere.starts_at } : null,
  };
}
