import 'server-only';
import { supabaseServer } from '@/shared/lib/supabase/server';

export type PublicFormation = { id: string; code: string; title: string; category: string | null };

type RpcRow = {
  id: string;
  organization_id: string;
  code: string;
  title: string;
  category: string | null;
};

// Catalogue public ORG-SCOPÉ : on résout l'OF depuis la formation du lien
// d'inscription (?formation=<id>), puis on liste SON catalogue publié.
// Lecture via RPC SECURITY DEFINER granted to anon (migration 0071) — pas de
// service-role côté requête publique, pas de fuite inter-OF.
export async function getPublicCatalog(formationId?: string): Promise<PublicFormation[]> {
  const id = (formationId ?? '').trim();
  if (!id) return [];

  const sb = supabaseServer();

  // 1) Résout la formation du lien (publiée uniquement) → détermine l'OF.
  const { data: pre } = await sb.rpc('get_published_formation' as never, { p_id: id } as never);
  const row = (Array.isArray(pre) ? pre[0] : pre) as unknown as RpcRow | undefined;
  if (!row) return [];

  // 2) Catalogue publié de CET OF.
  const { data: list } = await sb.rpc('list_published_formations' as never, {
    p_org: row.organization_id,
  } as never);
  const rows = (list as unknown as RpcRow[] | null) ?? [];

  const mapped = rows.map((r) => ({ id: r.id, code: r.code, title: r.title, category: r.category }));
  // Garantit la présence de la formation présélectionnée même si absente de la liste.
  if (!mapped.some((f) => f.id === row.id)) {
    mapped.unshift({ id: row.id, code: row.code, title: row.title, category: row.category });
  }
  return mapped;
}
