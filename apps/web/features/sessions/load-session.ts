import 'server-only';
import { exigerLecture } from '@/shared/lib/supabase/echec-lecture';

// Charge une session et son entourage SANS embed PostgREST sur `sessions`
// (le cache de schéma peut casser les relations de `sessions` depuis la migration
// 0106 — cf. app/(dashboard)/sessions/page.tsx). On lit à plat puis on rattache.

export type SessionLearner = {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  dossierId: string;
  dossierReference: string;
  /** Entreprise cliente du dossier ; null = particulier. */
  companyId: string | null;
  companyName: string | null;
};

export type SessionSheet = {
  id: string;
  half_day: 'morning' | 'afternoon' | 'full' | 'evening';
  status: 'open' | 'partial' | 'completed' | 'finalized';
  finalized_at: string | null;
  document_id: string | null;
  signed: number;
  total: number;
};

/** Participant inscrit à la main, sans dossier (séance libre pour un client). */
export type DirectParticipant = {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
};

export type LoadedSession = {
  session: {
    id: string;
    organization_id: string;
    dossier_id: string | null;
    formation_id: string | null;
    title: string | null;
    modality: string;
    status: string;
    starts_at: string;
    ends_at: string;
    duration_hours: number | null;
    location: string | null;
    remote_url: string | null;
  };
  formation: { id: string; title: string; code: string | null } | null;
  dossierIds: string[];
  learners: SessionLearner[];
  /** Apprenants rattachés directement à la séance (aucun dossier). */
  directLearners: DirectParticipant[];
  /** Entreprise cliente d'une séance planifiée sans formation ni dossier. */
  client: { id: string; name: string } | null;
  sheets: SessionSheet[];
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function loadSession(sb: any, id: string): Promise<LoadedSession | null> {
  const { data: sRow, error: erreurSeance } = await sb
    .schema('app')
    .from('sessions')
    .select(
      'id, organization_id, dossier_id, formation_id, title, modality, status, starts_at, ends_at, duration_hours, location, remote_url',
    )
    .eq('id', id)
    .maybeSingle();
  // La lecture qui identifie la séance : au-delà, `null` veut dire « absente ».
  exigerLecture('séance', erreurSeance);
  if (!sRow) return null;
  const session = sRow as LoadedSession['session'];

  // Dossiers rattachés : dossier_id direct + M2M session_dossiers.
  const { data: sd } = await sb
    .schema('app')
    .from('session_dossiers')
    .select('dossier_id')
    .eq('session_id', id);
  const dossierIds = [
    ...new Set(
      [
        ...(session.dossier_id ? [session.dossier_id] : []),
        ...((sd as { dossier_id: string }[] | null) ?? []).map((r) => r.dossier_id),
      ].filter(Boolean),
    ),
  ] as string[];

  const { data: dosData } = dossierIds.length
    ? await sb
        .schema('app')
        .from('dossiers')
        .select('id, reference, learner_id, formation_id, company_id')
        .in('id', dossierIds)
    : { data: [] as unknown[] };
  const dossiers =
    (dosData as {
      id: string;
      reference: string;
      learner_id: string | null;
      formation_id: string | null;
      company_id: string | null;
    }[]) ?? [];
  const companyIds = [...new Set(dossiers.map((d) => d.company_id).filter((v): v is string => !!v))];
  const { data: cData } = companyIds.length
    ? await sb.schema('app').from('companies').select('id, name').in('id', companyIds)
    : { data: [] as unknown[] };
  const companyNames = new Map(((cData as { id: string; name: string }[]) ?? []).map((c) => [c.id, c.name]));

  // Formation : formation_id de la session, sinon celle du 1er dossier.
  const formationId = session.formation_id ?? dossiers.find((d) => d.formation_id)?.formation_id ?? null;
  let formation: LoadedSession['formation'] = null;
  if (formationId) {
    const { data: fRow } = await sb
      .schema('app')
      .from('formations')
      .select('id, title, code')
      .eq('id', formationId)
      .maybeSingle();
    formation = (fRow as LoadedSession['formation']) ?? null;
  }

  // Apprenants (via les dossiers).
  const learnerToDossier = new Map<string, { id: string; reference: string; companyId: string | null }>();
  for (const d of dossiers) {
    if (d.learner_id && !learnerToDossier.has(d.learner_id)) {
      learnerToDossier.set(d.learner_id, { id: d.id, reference: d.reference, companyId: d.company_id });
    }
  }
  const learnerIds = [...learnerToDossier.keys()];
  const { data: lData } = learnerIds.length
    ? await sb.schema('app').from('learners').select('id, first_name, last_name, email').in('id', learnerIds)
    : { data: [] as unknown[] };
  const learners: SessionLearner[] = (
    (lData as { id: string; first_name: string; last_name: string; email: string }[]) ?? []
  ).map((l) => {
    const dref = learnerToDossier.get(l.id)!;
    return {
      id: l.id,
      first_name: l.first_name,
      last_name: l.last_name,
      email: l.email,
      dossierId: dref.id,
      dossierReference: dref.reference,
      companyId: dref.companyId,
      companyName: dref.companyId ? (companyNames.get(dref.companyId) ?? null) : null,
    };
  });

  // Séance libre : apprenants inscrits à la main, et entreprise cliente.
  // Ces deux lectures sont tolérantes à l'échec — `sessions.company_id` arrive
  // avec la migration 0161, et une base qui ne l'a pas encore ne doit pas
  // faire tomber toutes les pages de séance.
  const dejaVus = new Set(learners.map((l) => l.id));
  const { data: manuels } = await sb
    .schema('app')
    .from('session_participants')
    .select('learner_id, source')
    .eq('session_id', id)
    .eq('participant_kind', 'learner');
  const manuelIds = [
    ...new Set(
      ((manuels as { learner_id: string | null; source: string | null }[] | null) ?? [])
        .filter((p) => p.learner_id && p.source !== 'manual_remove' && !dejaVus.has(p.learner_id))
        .map((p) => p.learner_id as string),
    ),
  ];
  const { data: directData } = manuelIds.length
    ? await sb.schema('app').from('learners').select('id, first_name, last_name, email').in('id', manuelIds)
    : { data: [] as unknown[] };
  const directLearners = ((directData as DirectParticipant[] | null) ?? []).sort((a, b) =>
    `${a.last_name} ${a.first_name}`.localeCompare(`${b.last_name} ${b.first_name}`, 'fr'),
  );

  let client: LoadedSession['client'] = null;
  const { data: clientRow, error: clientErr } = await sb
    .schema('app')
    .from('sessions')
    .select('company_id')
    .eq('id', id)
    .maybeSingle();
  if (!clientErr) {
    const companyId = (clientRow as { company_id: string | null } | null)?.company_id ?? null;
    if (companyId) {
      const { data: c } = await sb.schema('app').from('companies').select('id, name').eq('id', companyId).maybeSingle();
      client = (c as { id: string; name: string } | null) ?? null;
    }
  }

  // Feuilles d'émargement de la session + compteur de signatures.
  const { data: sheetData } = await sb
    .schema('app')
    .from('attendance_sheets')
    .select('id, half_day, status, finalized_at, document_id')
    .eq('session_id', id)
    .order('half_day', { ascending: true });
  const sheetRows =
    (sheetData as {
      id: string;
      half_day: SessionSheet['half_day'];
      status: SessionSheet['status'];
      finalized_at: string | null;
      document_id: string | null;
    }[]) ?? [];

  // Une seule requête pour toutes les feuilles, au lieu d'une par feuille : une
  // formation de plusieurs jours en compte deux par jour, soit autant
  // d'allers-retours en base pour un simple comptage (audit CAP-22).
  const { data: sigsRows, error: sigsErr } = await sb
    .schema('app')
    .from('attendance_signatures')
    .select('attendance_sheet_id, status')
    .in(
      'attendance_sheet_id',
      sheetRows.map((sh) => sh.id),
    );
  if (sigsErr) console.error('[load-session] lecture des signatures échouée', sigsErr);

  const parFeuille = new Map<string, { total: number; signed: number }>();
  for (const r of (sigsRows as { attendance_sheet_id: string; status: string }[] | null) ?? []) {
    const acc = parFeuille.get(r.attendance_sheet_id) ?? { total: 0, signed: 0 };
    acc.total += 1;
    // Présences (signées ou attestées) ; « signed » n'est pas un statut : le compteur restait à 0.
    if (r.status === 'present' || r.status === 'late' || r.status === 'remote') acc.signed += 1;
    parFeuille.set(r.attendance_sheet_id, acc);
  }

  const sheets: SessionSheet[] = sheetRows.map((sh) => ({
    ...sh,
    // Sur les apprenants attendus : une ligne n'existe qu'une fois la présence recueillie.
    total: learners.length + directLearners.length,
    signed: parFeuille.get(sh.id)?.signed ?? 0,
  }));

  return { session, formation, dossierIds, learners, directLearners, client, sheets };
}
