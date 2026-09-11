import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { isSelfSigned } from '@/features/attendance/completeness';
import { syntheseSeance, type LigneSignature, type SyntheseSeance } from '@/features/attendance/session-attendance-summary';

/**
 * Page « Émargements » façon RFC : une ligne par séance, avec présence et
 * complétion, et des indicateurs d'ensemble. Lecture sous RLS (client de la
 * page) : chaque membre ne voit que les séances de son organisme.
 */

export type Onglet = 'actives' | 'terminees' | 'toutes';

export type LigneSeance = SyntheseSeance & {
  readonly id: string;
  readonly titre: string;
  readonly formateur: string | null;
  readonly lieu: string | null;
  readonly debut: string;
  readonly fin: string;
  readonly statut: string;
  readonly inscrits: number;
};

export type Indicateurs = {
  readonly tauxPresence: number | null;
  readonly completion: number | null;
  readonly presents: number;
  readonly remplies: number;
  readonly attendues: number;
  readonly absences: number;
  readonly retards: number;
  readonly signatures: number;
  readonly seances: number;
  readonly stagiaires: number;
};

const JOUR_MS = 24 * 60 * 60 * 1000;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Client = SupabaseClient<any, any, any>;

type Seance = { id: string; title: string | null; formation_id: string | null; dossier_id: string | null; status: string; starts_at: string; ends_at: string; location: string | null };

export async function listSessionsAttendance(sb: Client, onglet: Onglet, now = new Date()): Promise<{ lignes: LigneSeance[]; indicateurs: Indicateurs }> {
  let q = sb.schema('app').from('sessions').select('id, title, formation_id, dossier_id, status, starts_at, ends_at, location').neq('status', 'cancelled');
  if (onglet === 'actives') {
    q = q.gte('ends_at', new Date(now.getTime() - JOUR_MS).toISOString()).lte('starts_at', new Date(now.getTime() + 7 * JOUR_MS).toISOString()).order('starts_at', { ascending: true });
  } else if (onglet === 'terminees') {
    q = q.lt('ends_at', now.toISOString()).gte('ends_at', new Date(now.getTime() - 30 * JOUR_MS).toISOString()).order('starts_at', { ascending: false });
  } else {
    q = q.lte('starts_at', new Date(now.getTime() + 7 * JOUR_MS).toISOString()).order('starts_at', { ascending: false });
  }
  const { data, error } = await q.limit(100);
  if (error) throw error;
  const seances = (data ?? []) as Seance[];
  const vide: Indicateurs = { tauxPresence: null, completion: null, presents: 0, remplies: 0, attendues: 0, absences: 0, retards: 0, signatures: 0, seances: 0, stagiaires: 0 };
  if (!seances.length) return { lignes: [], indicateurs: vide };
  const ids = seances.map((s) => s.id);

  const [{ data: liens }, { data: feuilles }, { data: seanceFormateurs }] = await Promise.all([
    sb.schema('app').from('session_dossiers').select('session_id, dossier_id').in('session_id', ids),
    sb.schema('app').from('attendance_sheets').select('id, session_id').in('session_id', ids),
    sb.schema('app').from('session_trainers').select('session_id, trainer_id').in('session_id', ids).is('deleted_at', null),
  ]);
  const dossiersDe = new Map<string, Set<string>>();
  for (const s of seances) if (s.dossier_id) dossiersDe.set(s.id, new Set([s.dossier_id]));
  for (const l of (liens ?? []) as { session_id: string; dossier_id: string }[]) {
    dossiersDe.set(l.session_id, new Set([...(dossiersDe.get(l.session_id) ?? []), l.dossier_id]));
  }
  const tousDossiers = [...new Set([...dossiersDe.values()].flatMap((s) => [...s]))];
  const feuillesRows = (feuilles ?? []) as { id: string; session_id: string }[];

  const [{ data: dossiers }, { data: sigs }, { data: dossierFormateurs }] = await Promise.all([
    tousDossiers.length
      ? sb.schema('app').from('dossiers').select('id, learner_id, formation_id').in('id', tousDossiers).is('deleted_at', null)
      : Promise.resolve({ data: [] }),
    feuillesRows.length
      ? sb
          .schema('app')
          .from('attendance_signatures')
          .select('attendance_sheet_id, learner_id, status, signed_at, capture_mode, evidence_source')
          .eq('participant_kind', 'learner')
          .in('attendance_sheet_id', feuillesRows.map((f) => f.id))
      : Promise.resolve({ data: [] }),
    tousDossiers.length ? sb.schema('app').from('dossier_trainers').select('dossier_id, trainer_id').in('dossier_id', tousDossiers) : Promise.resolve({ data: [] }),
  ]);
  const dossierInfo = new Map(((dossiers ?? []) as { id: string; learner_id: string | null; formation_id: string | null }[]).map((d) => [d.id, d]));

  const formationIds = [
    ...new Set(
      seances
        .map((s) => s.formation_id ?? [...(dossiersDe.get(s.id) ?? [])].map((d) => dossierInfo.get(d)?.formation_id).find(Boolean) ?? null)
        .filter((x): x is string => Boolean(x)),
    ),
  ];
  const formateurDe = new Map<string, string>();
  for (const f of (seanceFormateurs ?? []) as { session_id: string; trainer_id: string }[]) if (!formateurDe.has(f.session_id)) formateurDe.set(f.session_id, f.trainer_id);
  const formateurDossier = new Map(((dossierFormateurs ?? []) as { dossier_id: string; trainer_id: string }[]).map((f) => [f.dossier_id, f.trainer_id]));
  for (const s of seances) {
    if (formateurDe.has(s.id)) continue;
    const t = [...(dossiersDe.get(s.id) ?? [])].map((d) => formateurDossier.get(d)).find(Boolean);
    if (t) formateurDe.set(s.id, t);
  }
  const trainerIds = [...new Set(formateurDe.values())];
  const [{ data: formations }, { data: trainers }] = await Promise.all([
    formationIds.length ? sb.schema('app').from('formations').select('id, title').in('id', formationIds) : Promise.resolve({ data: [] }),
    trainerIds.length ? sb.schema('app').from('trainers').select('id, first_name, last_name').in('id', trainerIds) : Promise.resolve({ data: [] }),
  ]);
  const titreFormation = new Map(((formations ?? []) as { id: string; title: string }[]).map((f) => [f.id, f.title]));
  const nomFormateur = new Map(((trainers ?? []) as { id: string; first_name: string; last_name: string }[]).map((t) => [t.id, `${t.first_name} ${t.last_name}`.trim()]));

  const signatures: LigneSignature[] = ((sigs ?? []) as {
    attendance_sheet_id: string;
    learner_id: string | null;
    status: string;
    signed_at: string | null;
    capture_mode: string | null;
    evidence_source: string | null;
  }[])
    .filter((g) => g.learner_id)
    .map((g) => ({
      sheetId: g.attendance_sheet_id,
      learnerId: g.learner_id as string,
      status: g.status,
      signedAt: g.signed_at,
      selfSigned: isSelfSigned({ captureMode: g.capture_mode, evidenceSource: g.evidence_source, signedAt: g.signed_at } as never),
    }));

  const stagiaires = new Set<string>();
  const lignes: LigneSeance[] = seances.map((s) => {
    const inscrits = [...new Set([...(dossiersDe.get(s.id) ?? [])].map((d) => dossierInfo.get(d)?.learner_id).filter((x): x is string => Boolean(x)))];
    inscrits.forEach((l) => stagiaires.add(l));
    const feuillesSeance = feuillesRows.filter((f) => f.session_id === s.id).map((f) => f.id);
    const formationId = s.formation_id ?? [...(dossiersDe.get(s.id) ?? [])].map((d) => dossierInfo.get(d)?.formation_id).find(Boolean) ?? null;
    const t = formateurDe.get(s.id);
    return {
      id: s.id,
      titre: (formationId ? titreFormation.get(formationId) : null) ?? s.title ?? 'Séance',
      formateur: t ? nomFormateur.get(t) ?? null : null,
      lieu: s.location,
      debut: s.starts_at,
      fin: s.ends_at,
      statut: s.status,
      inscrits: inscrits.length,
      ...syntheseSeance(feuillesSeance, inscrits, signatures),
    };
  });

  const somme = (k: 'presents' | 'remplies' | 'attendues' | 'absents' | 'excuses' | 'retards' | 'signatures') => lignes.reduce((t, l) => t + l[k], 0);
  const remplies = somme('remplies');
  const attendues = somme('attendues');
  return {
    lignes,
    indicateurs: {
      tauxPresence: remplies ? somme('presents') / remplies : null,
      completion: attendues ? remplies / attendues : null,
      presents: somme('presents'),
      remplies,
      attendues,
      absences: somme('absents') + somme('excuses'),
      retards: somme('retards'),
      signatures: somme('signatures'),
      seances: lignes.length,
      stagiaires: stagiaires.size,
    },
  };
}
