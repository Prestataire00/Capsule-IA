import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '@/shared/lib/supabase/admin';
import { loadSessionEmargement } from './queries/load-session-emargement';
import { renderAttendancePdf, type PdfSignatureLine } from './pdf-render';
import { loadOrgIdentity } from '@/features/documents/load-org-identity';
import { orgIdentityLines } from '@/features/documents/legal/org-identity';

/**
 * Feuille d'émargement signée d'UNE entreprise cliente (comme RFC) : ses
 * salariés et le formateur, avec entrées, sorties et signatures, le nom de la
 * société en tête. Elle se transmet à l'entreprise (et à son OPCO) sans
 * exposer les stagiaires des autres clients de la séance.
 *
 * Lecture de la séance sous RLS (client de l'appelant, qui borne l'accès) ;
 * signatures et images en service role, pour la séance ainsi autorisée.
 */
export async function renderCompanyAttendanceSheet(
  rls: Parameters<typeof loadSessionEmargement>[0],
  args: { sheetId: string; sessionId: string; organizationId: string; companyId: string },
): Promise<{ bytes: Buffer; companyName: string; halfDay: string; date: string } | null> {
  const vue = await loadSessionEmargement(rls, args.sessionId);
  const feuille = vue?.sheets.find((s) => s.id === args.sheetId);
  if (!vue || !feuille) return null;

  const admin = supabaseAdmin() as unknown as SupabaseClient;
  const [{ data: company }, { data: links }, { data: ctxData }, { data: sigsData }] = await Promise.all([
    admin
      .schema('app')
      .from('companies')
      .select('name')
      .eq('id', args.companyId)
      .eq('organization_id', args.organizationId)
      .maybeSingle(),
    admin.schema('app').from('session_dossiers').select('dossier_id').eq('session_id', args.sessionId),
    admin
      .schema('app')
      .from('attendance_sheets')
      .select('dossiers(reference, formations(title)), sessions(title, formation:formations(title)), organizations(name, logo_url)')
      .eq('id', args.sheetId)
      .maybeSingle(),
    admin
      .schema('app')
      .from('attendance_signatures')
      .select('participant_kind, learner_id, trainer_id, evidence_source, signature_image_path, exit_image_path')
      .eq('attendance_sheet_id', args.sheetId),
  ]);
  if (!company) return null;
  const companyName = (company as { name: string }).name;

  const dossierIds = ((links ?? []) as Array<{ dossier_id: string }>).map((l) => l.dossier_id);
  const { data: dossiers } = dossierIds.length
    ? await admin.schema('app').from('dossiers').select('learner_id').in('id', dossierIds).eq('company_id', args.companyId)
    : { data: [] };
  const learnerIds = new Set(((dossiers ?? []) as Array<{ learner_id: string }>).map((d) => d.learner_id));

  const ctx = ctxData as unknown as {
    dossiers: { reference: string; formations: { title: string } | null } | null;
    sessions: { title: string | null; formation: { title: string } | null } | null;
    organizations: { name: string; logo_url: string | null } | null;
  } | null;
  type Sig = {
    participant_kind: 'learner' | 'trainer';
    learner_id: string | null;
    trainer_id: string | null;
    evidence_source: PdfSignatureLine['evidenceSource'] | null;
    signature_image_path: string | null;
    exit_image_path: string | null;
  };
  const sigs = new Map<string, Sig>();
  for (const g of (sigsData ?? []) as unknown as Sig[]) sigs.set(`${g.participant_kind}:${g.learner_id ?? g.trainer_id}`, g);
  const signer = async (chemin: string | null | undefined) =>
    chemin ? ((await admin.storage.from('signatures').createSignedUrl(chemin, 300)).data?.signedUrl ?? null) : null;

  const lines: PdfSignatureLine[] = [];
  for (const p of feuille.participants) {
    if (p.kind === 'learner' && !learnerIds.has(p.id)) continue;
    const g = sigs.get(`${p.kind}:${p.id}`);
    lines.push({
      participantKind: p.kind,
      fullName: p.fullName,
      status: p.status === 'absent_justified' ? 'excused' : p.status === 'remote' ? 'present' : (p.status ?? null),
      signedAt: p.entryAt ?? p.attestedAt,
      signerIp: null,
      signerCountry: null,
      evidenceSource: g?.evidence_source ?? 'manual',
      signatureSignedUrl: await signer(g?.signature_image_path),
      exitAt: p.exitAt,
      exitSignatureUrl: await signer(g?.exit_image_path),
      exitAttested: p.exitAttested,
      lateArrival: p.lateArrival,
      earlyDeparture: p.earlyDeparture,
      absenceReason: p.absenceReason,
      captureMode: p.captureMode,
    });
  }

  const bytes = await renderAttendancePdf({
    sheetId: args.sheetId,
    halfDay: feuille.halfDay,
    dossierReference: `Société : ${companyName}`,
    formationTitle: ctx?.dossiers?.formations?.title ?? ctx?.sessions?.formation?.title ?? ctx?.sessions?.title ?? '—',
    organizationName: ctx?.organizations?.name ?? '—',
    organizationLines: orgIdentityLines(await loadOrgIdentity(admin, args.organizationId)).slice(1),
    organizationLogoUrl: ctx?.organizations?.logo_url ?? null,
    sessionStartsAt: new Date(feuille.windowStart),
    sessionEndsAt: new Date(feuille.windowEnd),
    modality: vue.session.modality,
    location: vue.session.location,
    lines,
  });
  return { bytes, companyName, halfDay: feuille.halfDay, date: feuille.windowStart.slice(0, 10) };
}
