import 'server-only';
import { supabaseAdmin } from '@/shared/lib/supabase/admin';
import { loadOrgIdentity } from '@/features/documents/load-org-identity';
import { orgIdentityLines } from '@/features/documents/legal/org-identity';
import { renderAttendancePdf, type PdfSignatureLine } from './pdf-render';
import type { SessionEmargementView, SheetView } from './queries/load-session-emargement';

/**
 * Le PDF d'une feuille d'émargement, tel qu'elle est à cet instant : celui de
 * la clôture, celui d'une correction après clôture, et le PDF à jour d'une
 * feuille encore ouverte. Une seule fabrique, pour qu'ils soient identiques.
 */
export async function rendrePdfFeuille(args: {
  sheetId: string;
  organizationId: string;
  feuille: SheetView;
  vue: NonNullable<SessionEmargementView>;
}): Promise<{ pdf: Buffer; reference: string | null }> {
  const sb = supabaseAdmin();
  const { feuille, vue } = args;
  const [{ data: ctxData }, { data: sigsData }] = await Promise.all([
    sb
      .schema('app')
      .from('attendance_sheets')
      .select('dossiers(reference, formations(title)), sessions(title, formation:formations(title)), organizations(name, logo_url)')
      .eq('id', args.sheetId)
      .maybeSingle(),
    sb
      .schema('app')
      .from('attendance_signatures')
      .select('participant_kind, learner_id, trainer_id, evidence_source, signature_image_path, exit_image_path')
      .eq('attendance_sheet_id', args.sheetId),
  ]);
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
    chemin ? ((await sb.storage.from('signatures').createSignedUrl(chemin, 300)).data?.signedUrl ?? null) : null;

  const lines: PdfSignatureLine[] = [];
  for (const p of feuille.participants) {
    const g = sigs.get(`${p.kind}:${p.id}`);
    lines.push({
      participantKind: p.kind,
      fullName: p.fullName,
      status: p.status === 'absent_justified' ? 'excused' : p.status === 'remote' ? 'present' : (p.status ?? 'absent'),
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

  const pdf = await renderAttendancePdf({
    sheetId: args.sheetId,
    halfDay: feuille.halfDay,
    dossierReference: ctx?.dossiers?.reference ?? 'Session de groupe',
    formationTitle: ctx?.dossiers?.formations?.title ?? ctx?.sessions?.formation?.title ?? ctx?.sessions?.title ?? '—',
    organizationName: ctx?.organizations?.name ?? '—',
    // Même bloc d'identité que sur les autres documents (SIRET, NDA, agréments).
    organizationLines: orgIdentityLines(await loadOrgIdentity(sb as never, args.organizationId)).slice(1),
    organizationLogoUrl: ctx?.organizations?.logo_url ?? null,
    sessionStartsAt: new Date(feuille.windowStart),
    sessionEndsAt: new Date(feuille.windowEnd),
    modality: vue.session.modality,
    location: vue.session.location,
    lines,
  });
  return { pdf, reference: ctx?.dossiers?.reference ?? null };
}
