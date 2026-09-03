import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/shared/lib/supabase/admin';
import { getCurrentMember } from '@/shared/lib/auth/current-member';
import { can } from '@/shared/lib/auth/permissions';

/**
 * Export des émargements en CSV — par apprenant, par entreprise, ou par séance.
 *
 * La plateforme savait afficher une feuille d'émargement, pas la sortir. Or un
 * organisme doit pouvoir produire, sur demande d'un financeur ou d'un auditeur,
 * l'assiduité d'un apprenant ou de tous les salariés d'une entreprise cliente.
 *
 * Point décisif : la matrice inclut les **absents** et les demi-journées **non
 * émargées**. Un export qui ne listerait que les signatures recueillies
 * donnerait un taux de présence de 100 % en toutes circonstances, et n'aurait
 * aucune valeur devant un contrôle.
 *
 * Filtres, combinables : ?learnerId= ?companyId= ?sessionId= ?dossierId=
 */

type FeuilleRow = {
  id: string;
  session_id: string;
  dossier_id: string | null;
  half_day: string;
  status: string;
  finalized_at: string | null;
  session: { start_at: string | null; title: string | null } | null;
};

type SignatureRow = {
  attendance_sheet_id: string;
  learner_id: string | null;
  status: string;
  signed_at: string | null;
  evidence_source: string | null;
};

type DossierRow = {
  id: string;
  reference: string | null;
  learner_id: string | null;
  company_id: string | null;
  learner: { first_name: string; last_name: string; email: string | null } | null;
  company: { name: string } | null;
  formation: { title: string } | null;
};

const un = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);

const DEMI_JOURNEE: Record<string, string> = { morning: 'Matin', afternoon: 'Après-midi' };

const PRESENCE: Record<string, string> = {
  present: 'Présent',
  absent: 'Absent',
  late: 'Retard',
  excused: 'Excusé',
};

/** Échappement CSV : guillemets doublés, champ encadré dès qu'il contient un séparateur. */
const cell = (v: string | number | null | undefined): string => {
  const s = v === null || v === undefined ? '' : String(v);
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export async function GET(req: Request) {
  const membre = await getCurrentMember();
  if (!membre) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  if (can(membre.role, 'attendance') === 'none') {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const url = new URL(req.url);
  const learnerId = url.searchParams.get('learnerId');
  const companyId = url.searchParams.get('companyId');
  const sessionId = url.searchParams.get('sessionId');
  const dossierId = url.searchParams.get('dossierId');

  const sb = supabaseAdmin();

  // 1. Les dossiers concernés, bornés à l'organisation du demandeur.
  let qDossiers = sb
    .schema('app')
    .from('dossiers')
    .select(
      'id, reference, learner_id, company_id, learner:learners(first_name, last_name, email), company:companies(name), formation:formations(title)',
    )
    .eq('organization_id', membre.organizationId)
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

  const dossierIds = dossiers.map((d) => d.id);

  // 2. Les feuilles d'émargement de ces dossiers.
  let qFeuilles = sb
    .schema('app')
    .from('attendance_sheets')
    .select('id, session_id, dossier_id, half_day, status, finalized_at, session:sessions(start_at, title)')
    .eq('organization_id', membre.organizationId)
    .in('dossier_id', dossierIds);
  if (sessionId) qFeuilles = qFeuilles.eq('session_id', sessionId);

  const { data: feuillesData, error: errF } = await qFeuilles;
  if (errF) {
    console.error('[export-emargements] feuilles', errF.message);
    return NextResponse.json({ error: 'query_failed' }, { status: 500 });
  }
  const feuilles = (feuillesData ?? []) as unknown as FeuilleRow[];
  if (feuilles.length === 0) return csv([]);

  // 3. Les signatures recueillies. Leur absence est une information : une
  //    demi-journée sans signature ressort « non émargé », pas « présent ».
  const { data: sigsData } = await sb
    .schema('app')
    .from('attendance_signatures')
    .select('attendance_sheet_id, learner_id, status, signed_at, evidence_source')
    .eq('organization_id', membre.organizationId)
    .eq('participant_kind', 'learner')
    .in(
      'attendance_sheet_id',
      feuilles.map((f) => f.id),
    );
  const signatures = (sigsData ?? []) as unknown as SignatureRow[];

  const parFeuilleEtApprenant = new Map<string, SignatureRow>();
  for (const s of signatures) {
    parFeuilleEtApprenant.set(`${s.attendance_sheet_id}|${s.learner_id ?? ''}`, s);
  }

  const parDossier = new Map(dossiers.map((d) => [d.id, d]));

  const lignes = feuilles
    .map((f) => {
      const d = f.dossier_id ? parDossier.get(f.dossier_id) : undefined;
      if (!d) return null;
      const sig = parFeuilleEtApprenant.get(`${f.id}|${d.learner_id ?? ''}`);
      const apprenant = un(d.learner);
      const debut = un(f.session)?.start_at ?? null;

      return {
        date: debut ? debut.slice(0, 10) : '',
        demiJournee: DEMI_JOURNEE[f.half_day] ?? f.half_day,
        seance: un(f.session)?.title ?? '',
        formation: un(d.formation)?.title ?? '',
        dossier: d.reference ?? '',
        apprenant: apprenant ? `${apprenant.first_name} ${apprenant.last_name}`.trim() : '',
        email: apprenant?.email ?? '',
        client: un(d.company)?.name ?? 'Particulier',
        presence: sig ? (PRESENCE[sig.status] ?? sig.status) : 'Non émargé',
        signeLe: sig?.signed_at ? sig.signed_at.slice(0, 16).replace('T', ' ') : '',
        origine: sig?.evidence_source ?? '',
        feuilleClose: f.finalized_at ? 'oui' : 'non',
      };
    })
    .filter((l): l is NonNullable<typeof l> => l !== null)
    .sort(
      (a, b) =>
        a.date.localeCompare(b.date) ||
        a.apprenant.localeCompare(b.apprenant, 'fr') ||
        a.demiJournee.localeCompare(b.demiJournee, 'fr'),
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
  signeLe: string;
  origine: string;
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
    'Signé le',
    'Origine',
    'Feuille close',
  ];

  const corps = lignes.map((l) =>
    [
      l.date,
      l.demiJournee,
      l.seance,
      l.formation,
      l.dossier,
      l.apprenant,
      l.email,
      l.client,
      l.presence,
      l.signeLe,
      l.origine,
      l.feuilleClose,
    ]
      .map(cell)
      .join(';'),
  );

  // Séparateur « ; » et BOM : Excel en français ouvre le fichier en colonnes et
  // affiche correctement les accents, sans passer par l'assistant d'import.
  const contenu = `﻿${entetes.map(cell).join(';')}\n${corps.join('\n')}\n`;

  return new NextResponse(contenu, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="emargements-${new Date().toISOString().slice(0, 10)}.csv"`,
      'Cache-Control': 'no-store',
    },
  });
}
