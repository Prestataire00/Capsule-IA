import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/shared/lib/supabase/admin';
import { getCurrentMember } from '@/shared/lib/auth/current-member';
import { can } from '@/shared/lib/auth/permissions';

/**
 * Export des émargements en CSV — par apprenant, par entreprise, ou par séance.
 *
 * Une ligne par apprenant et par demi-journée : entrée, sortie, retard,
 * départ anticipé, motif d'absence, façon dont la présence a été recueillie.
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
  attendance_sheet_id: string;
  learner_id: string | null;
  status: string;
  signed_at: string | null;
  exit_signed_at: string | null;
  late_arrival_time: string | null;
  early_departure_time: string | null;
  absence_reason: string | null;
  capture_mode: string | null;
  evidence_source: string | null;
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
const MODE: Record<string, string> = {
  lien: 'Lien personnel',
  qr: 'QR code',
  tablette: 'Tablette',
  visio: 'Visio',
  grille: 'Attestée par l’équipe',
  zoom: 'Zoom',
};
const SOURCE: Record<string, string> = { qr: 'Lien personnel', manual: 'Tablette', trainer_override: 'Attestée par l’équipe', zoom_csv: 'Zoom', zoom_api: 'Zoom' };

const PARIS = 'Europe/Paris';
const jour = (iso: string | null) => (iso ? new Intl.DateTimeFormat('fr-CA', { timeZone: PARIS }).format(new Date(iso)) : '');
const heure = (iso: string | null) =>
  iso ? new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: PARIS }).format(new Date(iso)) : '';

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
    .select('id, reference, learner_id, learner:learners(first_name, last_name, email), company:companies(name), formation:formations(title)')
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

  // 3. Les présences recueillies. Leur absence est une information : « non émargé ».
  const { data: sigsData } = await sb
    .schema('app')
    .from('attendance_signatures')
    .select(
      'attendance_sheet_id, learner_id, status, signed_at, exit_signed_at, late_arrival_time, early_departure_time, absence_reason, capture_mode, evidence_source',
    )
    .eq('organization_id', org)
    .eq('participant_kind', 'learner')
    .in(
      'attendance_sheet_id',
      feuilles.map((f) => f.id),
    );
  const parFeuilleEtApprenant = new Map<string, SignatureRow>();
  for (const s of (sigsData ?? []) as unknown as SignatureRow[]) {
    parFeuilleEtApprenant.set(`${s.attendance_sheet_id}|${s.learner_id ?? ''}`, s);
  }

  const lignes: Ligne[] = [];
  for (const f of feuilles) {
    const concernes = f.dossier_id ? [f.dossier_id] : [...(dossiersParSeance.get(f.session_id) ?? [])];
    for (const id of concernes) {
      const d = parDossier.get(id);
      if (!d) continue;
      const sig = parFeuilleEtApprenant.get(`${f.id}|${d.learner_id ?? ''}`);
      const apprenant = un(d.learner);
      const seance = un(f.session);
      lignes.push({
        date: jour(seance?.starts_at ?? null),
        demiJournee: DEMI_JOURNEE[f.half_day ?? 'full'] ?? f.half_day ?? '',
        seance: seance?.title ?? '',
        formation: un(d.formation)?.title ?? '',
        dossier: d.reference ?? '',
        apprenant: apprenant ? `${apprenant.first_name} ${apprenant.last_name}`.trim() : '',
        email: apprenant?.email ?? '',
        client: un(d.company)?.name ?? 'Particulier',
        presence: sig ? (PRESENCE[sig.status] ?? sig.status) : 'Non émargé',
        entree: heure(sig?.signed_at ?? null),
        sortie: heure(sig?.exit_signed_at ?? null),
        arrivee: sig?.late_arrival_time?.slice(0, 5) ?? '',
        depart: sig?.early_departure_time?.slice(0, 5) ?? '',
        motif: sig?.absence_reason ?? '',
        mode: sig ? (sig.capture_mode ? (MODE[sig.capture_mode] ?? sig.capture_mode) : (SOURCE[sig.evidence_source ?? ''] ?? '')) : '',
        feuilleClose: f.finalized_at ? 'oui' : 'non',
      });
    }
  }
  lignes.sort(
    (a, b) => a.date.localeCompare(b.date) || a.apprenant.localeCompare(b.apprenant, 'fr') || a.demiJournee.localeCompare(b.demiJournee, 'fr'),
  );
  return csv(lignes);
}

type Ligne = {
  date: string;
  demiJournee: string;
  seance: string;
  formation: string;
  dossier: string;
  apprenant: string;
  email: string;
  client: string;
  presence: string;
  entree: string;
  sortie: string;
  arrivee: string;
  depart: string;
  motif: string;
  mode: string;
  feuilleClose: string;
};

function csv(lignes: Ligne[]): NextResponse {
  const entetes = [
    'Date',
    'Demi-journée',
    'Séance',
    'Formation',
    'Dossier',
    'Apprenant',
    'E-mail',
    'Client',
    'Présence',
    'Entrée',
    'Sortie',
    'Arrivée (retard)',
    'Départ anticipé',
    'Motif d’absence',
    'Recueil',
    'Feuille close',
  ];
  const corps = lignes.map((l) =>
    [l.date, l.demiJournee, l.seance, l.formation, l.dossier, l.apprenant, l.email, l.client, l.presence, l.entree, l.sortie, l.arrivee, l.depart, l.motif, l.mode, l.feuilleClose]
      .map(cell)
      .join(';'),
  );
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
