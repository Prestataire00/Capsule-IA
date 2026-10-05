import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { SeanceAgenda } from './agenda-formateurs';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Sb = SupabaseClient<any, any, any>;

/** Les séances de l'organisme sur la période, avec leurs formateurs et leur évènement Google. */
export async function seancesPourAgenda(sb: Sb, organizationId: string, de: string, a: string): Promise<SeanceAgenda[]> {
  const { data, error } = await sb
    .schema('app')
    .from('sessions')
    .select('id, title, starts_at, ends_at, location, dossier_id, zoom_metadata, formation:formations(title)')
    .eq('organization_id', organizationId)
    .neq('status', 'cancelled')
    .gte('starts_at', de)
    .lt('starts_at', a)
    .order('starts_at');
  if (error) {
    console.error('[agenda] séances illisibles', error.message);
    return [];
  }
  const seances = (data ?? []) as unknown as Array<{
    id: string;
    title: string | null;
    starts_at: string;
    ends_at: string;
    location: string | null;
    dossier_id: string | null;
    zoom_metadata: { calendar_event_id?: string } | null;
    formation: { title: string | null } | Array<{ title: string | null }> | null;
  }>;
  if (seances.length === 0) return [];

  const dossierIds = [...new Set(seances.map((s) => s.dossier_id).filter((v): v is string => Boolean(v)))];
  const [{ data: st }, { data: dt }] = await Promise.all([
    sb.schema('app').from('session_trainers').select('session_id, trainer_id').in('session_id', seances.map((s) => s.id)).is('deleted_at', null),
    dossierIds.length ? sb.schema('app').from('dossier_trainers').select('dossier_id, trainer_id').in('dossier_id', dossierIds) : Promise.resolve({ data: [] }),
  ]);
  const deSeance = (st ?? []) as Array<{ session_id: string; trainer_id: string }>;
  const deDossier = (dt ?? []) as Array<{ dossier_id: string; trainer_id: string }>;
  const ids = [...new Set([...deSeance, ...deDossier].map((x) => x.trainer_id))];
  const { data: t } = ids.length
    ? await sb.schema('app').from('trainers').select('id, first_name, last_name').in('id', ids)
    : { data: [] };
  const nom = new Map(
    ((t ?? []) as Array<{ id: string; first_name: string | null; last_name: string | null }>).map((f) => [f.id, `${f.first_name ?? ''} ${f.last_name ?? ''}`.trim()]),
  );

  return seances.map((s) => {
    // Le formateur de la séance ; à défaut, celui de son dossier.
    let formateurs = deSeance.filter((x) => x.session_id === s.id).map((x) => x.trainer_id);
    if (formateurs.length === 0 && s.dossier_id) formateurs = deDossier.filter((x) => x.dossier_id === s.dossier_id).map((x) => x.trainer_id);
    const formation = Array.isArray(s.formation) ? s.formation[0]?.title : s.formation?.title;
    return {
      id: s.id,
      titre: s.title ?? formation ?? 'Séance',
      debut: s.starts_at,
      fin: s.ends_at,
      lieu: s.location,
      formateurs: [...new Set(formateurs)].map((id) => nom.get(id)).filter((n): n is string => Boolean(n)),
      evenementId: s.zoom_metadata?.calendar_event_id ?? null,
    };
  });
}
