import 'server-only';
import { supabaseAdmin } from '@/shared/lib/supabase/admin';
import { can } from '@/shared/lib/auth/permissions';
import { ENTITES } from './entities';

export type LigneCorbeille = {
  entite: string;
  id: string;
  nom: string;
  detail: string | null;
  supprimeLe: string | null;
};

export type GroupeCorbeille = {
  entite: string;
  pluriel: string;
  lignes: LigneCorbeille[];
};

/**
 * Contenu de la corbeille, groupé par type.
 *
 * Lecture en service_role, bornée à `orgId` : les politiques RLS de lecture
 * filtrent `deleted_at IS NULL`, donc un élément supprimé est invisible pour
 * l'utilisateur — il ne serait jamais restaurable autrement. Le cloisonnement
 * est ici explicite (organisation + droits du rôle).
 */
export async function loadTrash(orgId: string, role: string): Promise<GroupeCorbeille[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = supabaseAdmin() as any;

  const groupes = await Promise.all(
    Object.entries(ENTITES)
      // On ne montre que ce que le rôle a le droit de voir.
      .filter(([, def]) => can(role, def.section) !== 'none')
      .map(async ([entite, def]) => {
        const { data, error } = await admin
          .schema('app')
          .from(def.table)
          .select(def.select)
          .eq('organization_id', orgId)
          .not('deleted_at', 'is', null)
          .order('deleted_at', { ascending: false })
          .limit(100);

        if (error) {
          console.error(`[corbeille] lecture ${def.table} :`, error.message);
          return { entite, pluriel: def.pluriel, lignes: [] };
        }

        const lignes = ((data ?? []) as Record<string, unknown>[]).map<LigneCorbeille>((row) => ({
          entite,
          id: String(row.id),
          nom: def.libelle(row),
          detail: def.detail ? def.detail(row) : null,
          supprimeLe: (row.deleted_at as string | null) ?? null,
        }));
        return { entite, pluriel: def.pluriel, lignes };
      }),
  );

  return groupes.filter((g) => g.lignes.length > 0);
}
