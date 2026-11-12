import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/shared/lib/supabase/admin';
import { getCurrentMember } from '@/shared/lib/auth/current-member';
import { can } from '@/shared/lib/auth/permissions';
import { appareil, canal, changements, connexionVisio, horodatage } from '@/features/attendance/export/tracabilite';

/**
 * Export des émargements en CSV — par apprenant, par entreprise, ou par séance.
 *
 * Une ligne par participant et par demi-journée — chaque stagiaire, ceux des
 * dossiers de groupe compris, et le formateur — avec la preuve de chaque
 * signature (12/11/2026, « on n'a pas la traçabilité ») : horodatage à la
 * seconde, canal, qui a attesté, adresse IP, appareil, empreinte, connexion
 * visio, et les corrections apportées depuis (journal d'audit).
 * La matrice inclut les **absents** et les demi-journées **non émargées** :
 * sans elles, un export afficherait 100 % de présence en toutes circonstances.
 *
 * Les feuilles des sessions de groupe (sans dossier) sont incluses : elles
 * sont rattachées aux dossiers par les séances. L'export échouait par
 * ailleurs systématiquement (colonne `start_at` au lieu de `starts_at`).
 *
 * Filtres, combinables : ?learnerId= ?companyId= ?sessionId= ?dossierId=
 */

type Un<T> = T | T[] | null;
type FeuilleRow = {
  id: string;
  session_id: string;
  dossier_id: string | null;
  half_day: string | null;
  finalized_at: string | null;
  session: Un<{ starts_at: string | null; title: string | null }>;
};
type SignatureRow = {
  id: string;
  attendance_sheet_id: string;
  participant_kind: 'learner' | 'trainer';
  learner_id: string | null;
  trainer_id: string | null;
  status: string;
  signed_at: string | null;
  exit_signed_at: string | null;
  late_arrival_time: string | null;
  early_departure_time: string | null;
  absence_reason: string | null;
  capture_mode: string | null;
  evidence_source: string | null;
  evidence_payload: unknown;
  signer_ip: string | null;
  signer_user_agent: string | null;
  signer_country: string | null;
  signature_hash: string | null;
  exit_signer_ip: string | null;
  exit_signer_user_agent: string | null;
  exit_signature_hash: string | null;
  marked_by: string | null;
  exit_attested_by: string | null;
  created_at: string;
};
type DossierRow = {
  id: string;
  reference: string | null;
  learner_id: string | null;
  learner: Un<{ first_name: string; last_name: string; email: string | null }>;
  company: Un<{ name: string }>;
  formation: Un<{ title: string }>;
};

const un = <T,>(v: Un<T>): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);

const DEMI_JOURNEE: Record<string, string> = { morning: 'Matin', afternoon: 'Après-midi', full: 'Journée', evening: 'Soirée' };
const PRESENCE: Record<string, string> = {
  present: 'Présent',
  late: 'En retard',
  absent: 'Absent',
  absent_justified: 'Absent excusé',
  remote: 'À distance',
};

const PARIS = 'Europe/Paris';
const jour = (iso: string | null) => (iso ? new Intl.DateTimeFormat('fr-CA', { timeZone: PARIS }).format(new Date(iso)) : '');

/** Échappement CSV, et neutralisation des formules (=, +, -, @) à l'ouverture dans un tableur. */
const cell = (v: string | number | null | undefined): string => {
  let s = v === null || v === undefined ? '' : String(v);
  if (typeof v === 'string' && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export async function GET(req: Request) {
  const membre = await getCurrentMember();
  if (!membre) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  // Réservé à l'équipe : un formateur n'exporte pas les absences de tout l'organisme.
  if (can(membre.role, 'attendance') === 'none' || membre.role === 'formateur') {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const url = new URL(req.url);
  const learnerId = url.searchParams.get('learnerId');
  const companyId = url.searchParams.get('companyId');
  const sessionId = url.searchParams.get('sessionId');
  const dossierId = url.searchParams.get('dossierId');
  const org = membre.organizationId;
  const sb = supabaseAdmin();

  // 1. Les dossiers concernés, bornés à l'organisation du demandeur.
  let qDossiers = sb
    .schema('app')
    .from('dossiers')
    .select('id, reference, learner_id, learner:learners!dossiers_learner_id_fkey(first_name, last_name, email), company:companies(name), formation:formations(title)')
    .eq('organization_id', org)
    .is('deleted_at', null);
  if (learnerId) qDossiers = qDossiers.eq('learner_id', learnerId);
  if (companyId) qDossiers = qDossiers.eq('company_id', companyId);
  if (dossierId) qDossiers = qDossiers.eq('id', dossierId);
  const { data: dossiersData, error: errD } = await qDossiers;
  if (errD) {
    console.error('[export-emargements] dossiers', errD.message);
    return NextResponse.json({ error: 'query_failed' }, { status: 500 });
  }
  const dossiers = (dossiersData ?? []) as unknown as DossierRow[];
  if (dossiers.length === 0) return csv([]);
  const parDossier = new Map(dossiers.map((d) => [d.id, d]));
  const dossierIds = dossiers.map((d) => d.id);

  // 2. Séances de ces dossiers (y compris sessions de groupe), puis leurs feuilles.
  const { data: sdData } = await sb
    .schema('app')
    .from('session_dossiers' as never)
    .select('session_id, dossier_id')
    .in('dossier_id' as never, dossierIds as never);
  const dossiersParSeance = new Map<string, Set<string>>();
  for (const r of (sdData ?? []) as { session_id: string; dossier_id: string }[]) {
    const set = dossiersParSeance.get(r.session_id) ?? new Set<string>();
    set.add(r.dossier_id);
    dossiersParSeance.set(r.session_id, set);
  }
  const seanceIds = [...dossiersParSeance.keys()];

  // Deux lectures (feuilles propres aux dossiers, feuilles des séances de
  // groupe) plutôt qu'un filtre `or` composé à la main.
  const feuillesDe = () => {
    let q = sb
      .schema('app')
      .from('attendance_sheets')
      .select('id, session_id, dossier_id, half_day, finalized_at, session:sessions(starts_at, title)')
      .eq('organization_id', org);
    if (sessionId) q = q.eq('session_id', sessionId);
    return q;
  };
  const [propres, groupes] = await Promise.all([
    feuillesDe().in('dossier_id', dossierIds),
    seanceIds.length ? feuillesDe().in('session_id', seanceIds) : Promise.resolve({ data: [], error: null }),
  ]);
  const errF = propres.error ?? groupes.error;
  if (errF) {
    console.error('[export-emargements] feuilles', errF.message);
    return NextResponse.json({ error: 'query_failed' }, { status: 500 });
  }
  const feuilles = [
    ...new Map(
      ([...(propres.data ?? []), ...(groupes.data ?? [])] as unknown as FeuilleRow[]).map((f) => [f.id, f] as const),
    ).values(),
  ];
  if (feuilles.length === 0) return csv([]);

  // 3. Les stagiaires de chaque dossier : le titulaire et les membres d'un
  //    dossier de groupe — l'export ne sortait que le titulaire.
  const { data: membresData } = await sb
    .schema('app')
    .from('dossier_learners' as never)
    .select('dossier_id, learner_id')
    .in('dossier_id' as never, dossierIds as never);
  const stagiairesDuDossier = new Map<string, Set<string>>();
  for (const d of dossiers) if (d.learner_id) stagiairesDuDossier.set(d.id, new Set([d.learner_id]));
  for (const m of (membresData ?? []) as unknown as Array<{ dossier_id: string; learner_id: string }>) {
    stagiairesDuDossier.set(m.dossier_id, new Set([...(stagiairesDuDossier.get(m.dossier_id) ?? []), m.learner_id]));
  }
  // Attendus de chaque séance : un groupe n'attend que les siens.
  const seancesDesFeuilles = [...new Set(feuilles.map((f) => f.session_id))];
  const { data: partsData } = await sb
    .schema('app')
    .from('session_participants')
    .select('session_id, learner_id, source')
    .in('session_id', seancesDesFeuilles)
    .eq('participant_kind', 'learner');
  const attendusDeLaSeance = new Map<string, Set<string>>();
  for (const p of (partsData ?? []) as Array<{ session_id: string; learner_id: string | null; source: string | null }>) {
    if (!p.learner_id || p.source === 'manual_remove') continue;
    attendusDeLaSeance.set(p.session_id, new Set([...(attendusDeLaSeance.get(p.session_id) ?? []), p.learner_id]));
  }

  // 4. Les signatures, avec leur preuve.
  const { data: sigsData } = await sb
    .schema('app')
    .from('attendance_signatures')
    .select(
      'id, attendance_sheet_id, participant_kind, learner_id, trainer_id, status, signed_at, exit_signed_at, late_arrival_time, early_departure_time, absence_reason, capture_mode, evidence_source, evidence_payload, signer_ip, signer_user_agent, signer_country, signature_hash, exit_signer_ip, exit_signer_user_agent, exit_signature_hash, marked_by, exit_attested_by, created_at',
    )
    .eq('organization_id', org)
    .in(
      'attendance_sheet_id',
      feuilles.map((f) => f.id),
    );
  const signatures = (sigsData ?? []) as unknown as SignatureRow[];
  const parFeuilleEtApprenant = new Map<string, SignatureRow>();
  for (const s of signatures) if (s.participant_kind === 'learner') parFeuilleEtApprenant.set(`${s.attendance_sheet_id}|${s.learner_id ?? ''}`, s);

  // Noms : stagiaires, formateurs, et membres de l'équipe qui ont attesté.
  const learnerIds = [...new Set([...[...stagiairesDuDossier.values()].flatMap((x) => [...x]), ...signatures.map((s) => s.learner_id).filter((x): x is string => Boolean(x))])];
  const trainerIds = [...new Set(signatures.map((s) => s.trainer_id).filter((x): x is string => Boolean(x)))];
  const userIds = [...new Set(signatures.flatMap((s) => [s.marked_by, s.exit_attested_by]).filter((x): x is string => Boolean(x)))];

  // 5. Les corrections apportées depuis : le journal d'audit garde l'avant/après.
  const [{ data: learnersData }, { data: trainersData }, { data: profilsData }, { data: auditData }] = await Promise.all([
    learnerIds.length ? sb.schema('app').from('learners').select('id, first_name, last_name, email').in('id', learnerIds) : Promise.resolve({ data: [] }),
    trainerIds.length ? sb.schema('app').from('trainers').select('id, first_name, last_name, email').in('id', trainerIds) : Promise.resolve({ data: [] }),
    userIds.length ? sb.schema('app').from('profiles').select('user_id, full_name, email').in('user_id', userIds) : Promise.resolve({ data: [] }),
    signatures.length
      ? sb
          .schema('audit')
          .from('audit_log')
          .select('row_id, actor_user_id, before, after, occurred_at')
          .eq('table_name', 'attendance_signatures')
          .eq('action', 'update')
          .in('row_id', signatures.map((s) => s.id))
          .order('occurred_at', { ascending: true })
      : Promise.resolve({ data: [] }),
  ]);
  const personne = new Map(((learnersData ?? []) as Array<{ id: string; first_name: string; last_name: string; email: string | null }>).map((l) => [l.id, l]));
  const formateur = new Map(((trainersData ?? []) as Array<{ id: string; first_name: string; last_name: string; email: string | null }>).map((t) => [t.id, t]));
  const auteurs = (auditData ?? []) as Array<{ row_id: string; actor_user_id: string | null; before: unknown; after: unknown; occurred_at: string }>;
  const autresActeurs = [...new Set(auteurs.map((a) => a.actor_user_id).filter((x): x is string => Boolean(x) && !userIds.includes(x as string)))];
  const { data: profils2 } = autresActeurs.length ? await sb.schema('app').from('profiles').select('user_id, full_name, email').in('user_id', autresActeurs) : { data: [] };
  const membreNom = new Map(
    ([...(profilsData ?? []), ...(profils2 ?? [])] as Array<{ user_id: string; full_name: string | null; email: string | null }>).map((p) => [p.user_id, p.full_name?.trim() || p.email || 'Membre de l’équipe']),
  );
  const corrections = new Map<string, Array<{ quand: string; qui: string; quoi: string[] }>>();
  for (const a of auteurs) {
    const quoi = changements(a.before, a.after);
    if (quoi.length === 0) continue;
    corrections.set(a.row_id, [...(corrections.get(a.row_id) ?? []), { quand: a.occurred_at, qui: a.actor_user_id ? (membreNom.get(a.actor_user_id) ?? 'Membre de l’équipe') : 'Système', quoi }]);
  }

  const preuve = (sig: SignatureRow | undefined) => {
    const corr = sig ? (corrections.get(sig.id) ?? []) : [];
    const derniere = corr[corr.length - 1];
    return {
      presence: sig ? (PRESENCE[sig.status] ?? sig.status) : 'Non émargé',
      entree: horodatage(sig?.signed_at),
      canal: sig ? canal(sig.capture_mode, sig.evidence_source) : '',
      attestePar: sig?.marked_by ? (membreNom.get(sig.marked_by) ?? 'Membre de l’équipe') : '',
      ip: sig?.signer_ip ?? '',
      appareil: appareil(sig?.signer_user_agent),
      pays: sig?.signer_country ?? '',
      empreinte: sig?.signature_hash ?? '',
      sortie: horodatage(sig?.exit_signed_at),
      ipSortie: sig?.exit_signer_ip ?? '',
      sortieAttesteePar: sig?.exit_attested_by ? (membreNom.get(sig.exit_attested_by) ?? 'Membre de l’équipe') : '',
      arrivee: sig?.late_arrival_time?.slice(0, 5) ?? '',
      depart: sig?.early_departure_time?.slice(0, 5) ?? '',
      motif: sig?.absence_reason ?? '',
      visio: connexionVisio(sig?.evidence_payload),
      nbCorrections: corr.length ? String(corr.length) : '',
      derniereCorrection: derniere ? `${horodatage(derniere.quand)} · ${derniere.qui} · ${derniere.quoi.join(', ')}` : '',
    };
  };

  const lignes: Ligne[] = [];
  for (const f of feuilles) {
    const seance = un(f.session);
    const concernes = f.dossier_id ? [f.dossier_id] : [...(dossiersParSeance.get(f.session_id) ?? [])];
    const attendus = attendusDeLaSeance.get(f.session_id);
    const vus = new Set<string>();
    for (const id of concernes) {
      const d = parDossier.get(id);
      if (!d) continue;
      for (const learnerId of stagiairesDuDossier.get(id) ?? []) {
        const sig = parFeuilleEtApprenant.get(`${f.id}|${learnerId}`);
        // Un groupe n'attend que ses membres ; une signature, elle, se montre toujours.
        if (!sig && attendus && attendus.size > 0 && !attendus.has(learnerId)) continue;
        if (vus.has(learnerId)) continue;
        vus.add(learnerId);
        const p = personne.get(learnerId);
        lignes.push({
          date: jour(seance?.starts_at ?? null),
          demiJournee: DEMI_JOURNEE[f.half_day ?? 'full'] ?? f.half_day ?? '',
          seance: seance?.title ?? '',
          formation: un(d.formation)?.title ?? '',
          dossier: d.reference ?? '',
          participant: p ? `${p.first_name} ${p.last_name}`.trim() : '',
          role: 'Stagiaire',
          email: p?.email ?? '',
          client: un(d.company)?.name ?? 'Particulier',
          ...preuve(sig),
          feuilleClose: f.finalized_at ? horodatage(f.finalized_at) : 'non close',
        });
      }
    }
    // Le formateur signe aussi chaque demi-journée.
    for (const sig of signatures.filter((x) => x.attendance_sheet_id === f.id && x.participant_kind === 'trainer')) {
      const t = sig.trainer_id ? formateur.get(sig.trainer_id) : undefined;
      const d = parDossier.get(concernes[0] ?? '');
      lignes.push({
        date: jour(seance?.starts_at ?? null),
        demiJournee: DEMI_JOURNEE[f.half_day ?? 'full'] ?? f.half_day ?? '',
        seance: seance?.title ?? '',
        formation: d ? (un(d.formation)?.title ?? '') : '',
        dossier: concernes.map((c) => parDossier.get(c)?.reference ?? '').filter(Boolean).join(' / '),
        participant: t ? `${t.first_name} ${t.last_name}`.trim() : 'Formateur',
        role: 'Formateur',
        email: t?.email ?? '',
        client: '',
        ...preuve(sig),
        feuilleClose: f.finalized_at ? horodatage(f.finalized_at) : 'non close',
      });
    }
  }
  lignes.sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      a.demiJournee.localeCompare(b.demiJournee, 'fr') ||
      (a.role === b.role ? 0 : a.role === 'Formateur' ? -1 : 1) ||
      a.participant.localeCompare(b.participant, 'fr'),
  );
  return csv(lignes);
}

type Ligne = {
  date: string;
  demiJournee: string;
  seance: string;
  formation: string;
  dossier: string;
  participant: string;
  role: string;
  email: string;
  client: string;
  presence: string;
  entree: string;
  canal: string;
  attestePar: string;
  ip: string;
  appareil: string;
  pays: string;
  empreinte: string;
  sortie: string;
  ipSortie: string;
  sortieAttesteePar: string;
  arrivee: string;
  depart: string;
  motif: string;
  visio: string;
  nbCorrections: string;
  derniereCorrection: string;
  feuilleClose: string;
};

const COLONNES: Array<[keyof Ligne, string]> = [
  ['date', 'Date'],
  ['demiJournee', 'Demi-journée'],
  ['seance', 'Séance'],
  ['formation', 'Formation'],
  ['dossier', 'Dossier'],
  ['participant', 'Participant'],
  ['role', 'Rôle'],
  ['email', 'E-mail'],
  ['client', 'Client'],
  ['presence', 'Présence'],
  ['entree', 'Signature d’entrée (horodatage)'],
  ['canal', 'Canal'],
  ['attestePar', 'Attestée par'],
  ['ip', 'Adresse IP'],
  ['appareil', 'Appareil'],
  ['pays', 'Pays'],
  ['empreinte', 'Empreinte de la signature'],
  ['sortie', 'Signature de sortie (horodatage)'],
  ['ipSortie', 'Adresse IP (sortie)'],
  ['sortieAttesteePar', 'Sortie attestée par'],
  ['arrivee', 'Arrivée (retard)'],
  ['depart', 'Départ anticipé'],
  ['motif', 'Motif d’absence'],
  ['visio', 'Connexion visio'],
  ['nbCorrections', 'Corrections'],
  ['derniereCorrection', 'Dernière correction'],
  ['feuilleClose', 'Feuille close le'],
];

function csv(lignes: Ligne[]): NextResponse {
  const entetes = COLONNES.map(([, libelle]) => libelle);
  const corps = lignes.map((l) => COLONNES.map(([cle]) => cell(l[cle])).join(';'));
  // Séparateur « ; » et BOM : Excel en français ouvre le fichier en colonnes, accents compris.
  const contenu = `﻿${entetes.map(cell).join(';')}\n${corps.join('\n')}\n`;
  return new NextResponse(contenu, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="emargements-${new Date().toISOString().slice(0, 10)}.csv"`,
      'Cache-Control': 'no-store',
    },
  });
}
