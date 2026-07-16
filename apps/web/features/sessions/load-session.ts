import 'server-only';

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
  sheets: SessionSheet[];
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function loadSession(sb: any, id: string): Promise<LoadedSession | null> {
  const { data: sRow } = await sb
    .schema('app')
    .from('sessions')
    .select(
      'id, organization_id, dossier_id, formation_id, title, modality, status, starts_at, ends_at, duration_hours, location, remote_url',
    )
    .eq('id', id)
    .maybeSingle();
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
    ? await sb.schema('app').from('dossiers').select('id, reference, learner_id, formation_id').in('id', dossierIds)
    : { data: [] as unknown[] };
  const dossiers =
    (dosData as { id: string; reference: string; learner_id: string | null; formation_id: string | null }[]) ?? [];

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
  const learnerToDossier = new Map<string, { id: string; reference: string }>();
  for (const d of dossiers) {
    if (d.learner_id && !learnerToDossier.has(d.learner_id)) {
      learnerToDossier.set(d.learner_id, { id: d.id, reference: d.reference });
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
    };
  });

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

  const sheets: SessionSheet[] = [];
  for (const sh of sheetRows) {
    const { data: sigs } = await sb
      .schema('app')
      .from('attendance_signatures')
      .select('status')
      .eq('attendance_sheet_id', sh.id);
    const rows = (sigs as { status: string }[] | null) ?? [];
    sheets.push({
      ...sh,
      total: rows.length,
      signed: rows.filter((r) => r.status === 'signed').length,
    });
  }

  return { session, formation, dossierIds, learners, sheets };
}
