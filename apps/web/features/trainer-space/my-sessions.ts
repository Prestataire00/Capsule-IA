import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Séances du formateur connecté.
 *
 * La liste des identifiants vient de `my_trainer_session_ids()` (0150) : même
 * un administrateur qui est aussi formateur ne voit ici que SES séances, et non
 * toutes celles de son organisme. Les titres sont résolus à part (formation de
 * la séance, sinon celle de son dossier) pour éviter l'ambiguïté des jointures
 * séance ↔ dossier.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Client = SupabaseClient<any, any, any>;

export type MySession = {
  readonly id: string;
  readonly title: string;
  readonly modality: string;
  readonly status: string;
  readonly startsAt: string;
  readonly endsAt: string;
  readonly location: string | null;
  readonly remoteUrl: string | null;
  readonly organizationId: string;
};

type Seance = {
  id: string;
  title: string | null;
  modality: string;
  status: string;
  starts_at: string;
  ends_at: string;
  location: string | null;
  remote_url: string | null;
  zoom_join_url: string | null;
  organization_id: string;
  formation_id: string | null;
  dossier_id: string | null;
};

export async function mySessionIds(sb: Client): Promise<string[]> {
  const { data, error } = await sb.schema('app').rpc('my_trainer_session_ids');
  if (error) throw error;
  return (data ?? []) as string[];
}

export async function loadSessionsByIds(
  sb: Client,
  ids: readonly string[],
  range: { from: Date; to: Date },
  organizationId?: string | null,
): Promise<MySession[]> {
  if (ids.length === 0) return [];
  let q = sb
    .schema('app')
    .from('sessions')
    .select('id, title, modality, status, starts_at, ends_at, location, remote_url, zoom_join_url, organization_id, formation_id, dossier_id')
    .in('id', [...ids])
    .lt('starts_at', range.to.toISOString())
    .gt('ends_at', range.from.toISOString())
    .order('starts_at', { ascending: true });
  if (organizationId) q = q.eq('organization_id', organizationId);
  const { data, error } = await q;
  if (error) throw error;
  const seances = (data ?? []) as Seance[];

  const dossierIds = [...new Set(seances.map((s) => s.dossier_id).filter((x): x is string => Boolean(x)))];
  const { data: dossiers } = dossierIds.length
    ? await sb.schema('app').from('dossiers').select('id, formation_id').in('id', dossierIds)
    : { data: [] };
  const formationDuDossier = new Map(((dossiers ?? []) as { id: string; formation_id: string | null }[]).map((d) => [d.id, d.formation_id]));

  const formationIds = [
    ...new Set(
      seances
        .map((s) => s.formation_id ?? (s.dossier_id ? formationDuDossier.get(s.dossier_id) : null))
        .filter((x): x is string => Boolean(x)),
    ),
  ];
  const { data: formations } = formationIds.length
    ? await sb.schema('app').from('formations').select('id, title').in('id', formationIds)
    : { data: [] };
  const titre = new Map(((formations ?? []) as { id: string; title: string }[]).map((f) => [f.id, f.title]));

  return seances.map((s) => {
    const formationId = s.formation_id ?? (s.dossier_id ? formationDuDossier.get(s.dossier_id) : null);
    return {
      id: s.id,
      title: (formationId ? titre.get(formationId) : null) ?? s.title ?? 'Séance',
      modality: s.modality,
      status: s.status,
      startsAt: s.starts_at,
      endsAt: s.ends_at,
      location: s.location,
      remoteUrl: s.zoom_join_url ?? s.remote_url,
      organizationId: s.organization_id,
    };
  });
}
