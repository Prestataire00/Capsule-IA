import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { estForme, FORME_LABELS } from './kinds';
import { isSupportStatus, type SupportStatus } from '@/features/trainer-space/support-status';

/**
 * Ce que les formateurs ont préparé pour une formation : le cours de chaque
 * séance (exercices, quiz, supports) et le travail individuel des dossiers.
 *
 * Lecture sous RLS : la page des supports de la formation est une page
 * d'équipe, et un membre ne voit que les séances de son organisme.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Client = SupabaseClient<any, any, any>;

export type ElementDeCours = {
  readonly id: string;
  readonly titre: string;
  readonly nature: string;
  readonly statut: SupportStatus;
  readonly publie: boolean;
};

export type CoursPrepare = {
  readonly ancrage: 'seance' | 'dossier';
  readonly id: string;
  readonly titre: string;
  readonly debut: string | null;
  readonly formateurs: readonly string[];
  readonly exercices: readonly ElementDeCours[];
  readonly supports: readonly ElementDeCours[];
  readonly lien: string;
};

const statut = (v: string | null): SupportStatus => (v && isSupportStatus(v) ? v : 'en_attente');

export async function loadCoursDeLaFormation(sb: Client, formationId: string): Promise<CoursPrepare[]> {
  const { data: dossiersData, error: errDossiers } = await sb
    .schema('app')
    .from('dossiers')
    .select('id, reference')
    .eq('formation_id', formationId)
    .is('deleted_at', null);
  if (errDossiers) throw new Error(`dossiers: ${errDossiers.message}`);
  const dossiers = (dossiersData as { id: string; reference: string | null }[] | null) ?? [];
  const idsDossiers = dossiers.map((d) => d.id);

  const [{ data: parFormation, error: e1 }, { data: parDossier, error: e2 }] = await Promise.all([
    sb.schema('app').from('sessions').select('id, title, starts_at').eq('formation_id', formationId),
    idsDossiers.length
      ? sb.schema('app').from('sessions').select('id, title, starts_at').in('dossier_id', idsDossiers)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (e1) throw new Error(`sessions: ${e1.message}`);
  if (e2) throw new Error(`sessions: ${e2.message}`);
  const seances = new Map<string, { id: string; title: string | null; starts_at: string | null }>();
  for (const s of [...((parFormation as never[]) ?? []), ...((parDossier as never[]) ?? [])] as {
    id: string;
    title: string | null;
    starts_at: string | null;
  }[]) {
    seances.set(s.id, s);
  }
  const idsSeances = [...seances.keys()];
  if (idsSeances.length === 0 && idsDossiers.length === 0) return [];

  const [exSeances, exDossiers, ressources, intervenants] = await Promise.all([
    idsSeances.length
      ? sb
          .schema('app')
          .from('exercises' as never)
          .select('id, kind, title, session_id, dossier_id, is_published, validation_status')
          .in('session_id', idsSeances)
          .is('deleted_at', null)
      : Promise.resolve({ data: [], error: null }),
    idsDossiers.length
      ? sb
          .schema('app')
          .from('exercises' as never)
          .select('id, kind, title, session_id, dossier_id, is_published, validation_status')
          .in('dossier_id', idsDossiers)
          .is('session_id', null)
          .is('deleted_at', null)
      : Promise.resolve({ data: [], error: null }),
    idsSeances.length
      ? sb
          .schema('app')
          .from('session_resources' as never)
          .select('id, title, kind, session_id, is_published, validation_status')
          .in('session_id', idsSeances)
          .is('deleted_at', null)
          .order('position', { ascending: true })
      : Promise.resolve({ data: [], error: null }),
    idsSeances.length
      ? sb
          .schema('app')
          .from('session_trainers')
          .select('session_id, trainer:trainers(first_name, last_name)')
          .in('session_id', idsSeances)
          .is('deleted_at', null)
      : Promise.resolve({ data: [], error: null }),
  ]);
  for (const r of [exSeances, exDossiers, ressources, intervenants]) {
    if (r.error) throw new Error(`cours de la formation: ${r.error.message}`);
  }

  type Ex = {
    id: string;
    kind: string | null;
    title: string;
    session_id: string | null;
    dossier_id: string | null;
    is_published: boolean;
    validation_status: string | null;
  };
  type Res = { id: string; title: string; kind: string; session_id: string; is_published: boolean; validation_status: string | null };

  const versElement = (e: Ex): ElementDeCours => ({
    id: e.id,
    titre: e.title,
    nature: estForme(e.kind) ? FORME_LABELS[e.kind] : 'Devoir',
    statut: statut(e.validation_status),
    publie: e.is_published,
  });

  const exercicesParSeance = new Map<string, ElementDeCours[]>();
  for (const e of ((exSeances.data as unknown as Ex[] | null) ?? [])) {
    if (!e.session_id) continue;
    exercicesParSeance.set(e.session_id, [...(exercicesParSeance.get(e.session_id) ?? []), versElement(e)]);
  }
  const exercicesParDossier = new Map<string, ElementDeCours[]>();
  for (const e of ((exDossiers.data as unknown as Ex[] | null) ?? [])) {
    if (!e.dossier_id) continue;
    exercicesParDossier.set(e.dossier_id, [...(exercicesParDossier.get(e.dossier_id) ?? []), versElement(e)]);
  }
  const supportsParSeance = new Map<string, ElementDeCours[]>();
  for (const r of ((ressources.data as unknown as Res[] | null) ?? [])) {
    supportsParSeance.set(r.session_id, [
      ...(supportsParSeance.get(r.session_id) ?? []),
      {
        id: r.id,
        titre: r.title,
        nature: r.kind === 'lien' ? 'Lien' : 'Fichier',
        statut: statut(r.validation_status),
        publie: r.is_published,
      },
    ]);
  }
  const formateursParSeance = new Map<string, string[]>();
  for (const t of ((intervenants.data as unknown as {
    session_id: string;
    trainer: { first_name: string | null; last_name: string | null } | null;
  }[] | null) ?? [])) {
    const nom = `${t.trainer?.first_name ?? ''} ${t.trainer?.last_name ?? ''}`.trim();
    if (nom) formateursParSeance.set(t.session_id, [...(formateursParSeance.get(t.session_id) ?? []), nom]);
  }

  const parSeance: CoursPrepare[] = idsSeances
    .map((id) => {
      const s = seances.get(id)!;
      return {
        ancrage: 'seance' as const,
        id,
        titre: s.title?.trim() || 'Séance',
        debut: s.starts_at,
        formateurs: formateursParSeance.get(id) ?? [],
        exercices: exercicesParSeance.get(id) ?? [],
        supports: supportsParSeance.get(id) ?? [],
        lien: `/sessions/${id}/cours`,
      };
    })
    .filter((c) => c.exercices.length + c.supports.length > 0)
    .sort((a, b) => (b.debut ?? '').localeCompare(a.debut ?? ''));

  const parDossierIndividuel: CoursPrepare[] = dossiers
    .filter((d) => (exercicesParDossier.get(d.id) ?? []).length > 0)
    .map((d) => ({
      ancrage: 'dossier' as const,
      id: d.id,
      titre: `Suivi individuel · ${d.reference ?? 'dossier'}`,
      debut: null,
      formateurs: [],
      exercices: exercicesParDossier.get(d.id) ?? [],
      supports: [],
      lien: `/dossiers/${d.id}/exercices`,
    }));

  return [...parSeance, ...parDossierIndividuel];
}
