import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Le dossier qu'un contenu à valider concerne, lisible d'un coup d'œil : la
 * référence seule ne dit pas de quel client il s'agit.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Client = SupabaseClient<any, any, any>;

export type DossierConcerne = { readonly id: string; readonly reference: string; readonly client: string | null };

export async function etiquettesDossiers(
  admin: Client,
  organizationId: string,
  ids: readonly string[],
): Promise<Map<string, DossierConcerne>> {
  const uniques = [...new Set(ids)];
  if (uniques.length === 0) return new Map();
  const { data, error } = await admin
    .schema('app')
    .from('dossiers')
    .select('id, reference, company:companies!dossiers_company_id_fkey(name), learner:learners!dossiers_learner_id_fkey(first_name, last_name)')
    .eq('organization_id', organizationId)
    .in('id', uniques);
  if (error) throw new Error(`dossiers concernés: ${error.message}`);
  const lignes = (data ?? []) as unknown as Array<{
    id: string;
    reference: string;
    company: { name: string | null } | null;
    learner: { first_name: string | null; last_name: string | null } | null;
  }>;
  return new Map(
    lignes.map((d) => {
      const apprenant = `${d.learner?.first_name ?? ''} ${d.learner?.last_name ?? ''}`.trim();
      return [d.id, { id: d.id, reference: d.reference, client: d.company?.name?.trim() || apprenant || null }];
    }),
  );
}

/** Les dossiers de chaque séance : le dossier direct et ceux du rattachement multiple. */
export async function dossiersDesSeances(
  admin: Client,
  organizationId: string,
  sessionIds: readonly string[],
): Promise<Map<string, DossierConcerne[]>> {
  const uniques = [...new Set(sessionIds)];
  if (uniques.length === 0) return new Map();
  const [{ data: seances, error: e1 }, { data: liens, error: e2 }] = await Promise.all([
    admin.schema('app').from('sessions').select('id, dossier_id').eq('organization_id', organizationId).in('id', uniques),
    admin.schema('app').from('session_dossiers').select('session_id, dossier_id').in('session_id', uniques),
  ]);
  if (e1) throw new Error(`séances: ${e1.message}`);
  if (e2) throw new Error(`session_dossiers: ${e2.message}`);
  const paires: Array<[string, string]> = [
    ...((seances ?? []) as Array<{ id: string; dossier_id: string | null }>)
      .filter((s) => s.dossier_id)
      .map((s): [string, string] => [s.id, s.dossier_id!]),
    ...((liens ?? []) as Array<{ session_id: string; dossier_id: string }>).map((l): [string, string] => [l.session_id, l.dossier_id]),
  ];
  const etiquettes = await etiquettesDossiers(admin, organizationId, paires.map(([, d]) => d));
  const parSeance = new Map<string, DossierConcerne[]>();
  for (const [s, d] of paires) {
    const e = etiquettes.get(d);
    const deja = parSeance.get(s) ?? [];
    if (e && !deja.some((x) => x.id === d)) parSeance.set(s, [...deja, e]);
  }
  return parSeance;
}
