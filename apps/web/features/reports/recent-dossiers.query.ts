import 'server-only';
import type { supabaseServer } from '@/shared/lib/supabase/server';

/**
 * Derniers dossiers de l'organisme, pour l'accueil et la barre latérale.
 *
 * Les deux affichaient jusqu'ici les dossiers du module de démonstration :
 * apprenants et références inventés, indiscernables de vrais dossiers, et
 * identiques pour tous les organismes (audit CAP-28).
 */
export type RecentDossier = {
  readonly id: string;
  readonly reference: string;
  readonly learnerName: string;
  readonly formationTitle: string;
  readonly companyName: string | null;
  readonly status: string;
  readonly progress: number;
};

type Row = {
  id: string;
  reference: string | null;
  status: string | null;
  total_hours: number | string | null;
  learner: { first_name: string; last_name: string } | { first_name: string; last_name: string }[] | null;
  formation: { title: string } | { title: string }[] | null;
  company: { name: string } | { name: string }[] | null;
};

const un = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);

/** Avancement grossier, tiré du statut : la vraie progression vit dans le dossier. */
const AVANCEMENT: Record<string, number> = {
  draft: 0,
  planned: 0,
  active: 50,
  completed: 100,
  closed: 100,
  archived: 100,
  cancelled: 0,
};

export async function getRecentDossiers(
  sb: ReturnType<typeof supabaseServer>,
  limite = 5,
): Promise<RecentDossier[]> {
  const { data, error } = await sb
    .schema('app')
    .from('dossiers')
    .select('id, reference, status, total_hours, learner:learners!dossiers_learner_id_fkey(first_name, last_name), formation:formations(title), company:companies(name)',
    )
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(limite);

  if (error) {
    console.error(`[recent-dossiers] indisponible — liste vide: ${error.message}`);
    return [];
  }

  return ((data ?? []) as unknown as Row[]).map((d) => {
    const l = un(d.learner);
    return {
      id: d.id,
      reference: d.reference ?? '—',
      learnerName: l ? `${l.first_name} ${l.last_name}`.trim() : '—',
      formationTitle: un(d.formation)?.title ?? '—',
      companyName: un(d.company)?.name ?? null,
      status: d.status ?? 'draft',
      progress: AVANCEMENT[d.status ?? 'draft'] ?? 0,
    };
  });
}
