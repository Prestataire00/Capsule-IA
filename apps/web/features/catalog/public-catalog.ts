import 'server-only';
import { supabaseServer } from '@/shared/lib/supabase/server';

export type PublicFormation = {
  id: string;
  code: string;
  title: string;
  category: string | null;
  modality: string | null;
  durationHours: number | null;
};

type RpcRow = {
  id: string;
  organization_id: string;
  code: string;
  title: string;
  category: string | null;
  default_modality: string | null;
  default_duration_hours: number | null;
};

const mapRow = (r: RpcRow): PublicFormation => ({
  id: r.id,
  code: r.code,
  title: r.title,
  category: r.category,
  modality: r.default_modality,
  durationHours: r.default_duration_hours,
});

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

  const mapped = rows.map(mapRow);
  // Garantit la présence de la formation présélectionnée même si absente de la liste.
  if (!mapped.some((f) => f.id === row.id)) {
    mapped.unshift(mapRow(row));
  }
  return mapped;
}

// Catalogue public d'un OF identifié directement par son id (lien d'inscription
// niveau organisme : /inscription?org=<id>). Même RPC publique (publiées uniquement).
export async function getPublicCatalogByOrg(orgId?: string): Promise<PublicFormation[]> {
  const id = (orgId ?? '').trim();
  if (!id) return [];
  const sb = supabaseServer();
  const { data: list } = await sb.rpc('list_published_formations' as never, { p_org: id } as never);
  const rows = (list as unknown as RpcRow[] | null) ?? [];
  return rows.map(mapRow);
}
