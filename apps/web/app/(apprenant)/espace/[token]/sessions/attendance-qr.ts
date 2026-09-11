import 'server-only';
import { verifyApprenantToken } from '@/shared/lib/apprenant-token';
import { supabaseAdmin } from '@/shared/lib/supabase/admin';
import { issueAttendanceLink } from '@/features/attendance/issue-attendance-link';
import { renderQrPng } from '@/shared/lib/qr';
import { env } from '@/env.mjs';

export type SessionSignatureQr = {
  sheetId: string;
  halfDay: string;
  status: string;
  qrDataUrl: string;
  url: string;
  alreadySigned: boolean;
};

export const HALF_DAY_LABEL: Record<string, string> = {
  morning: 'Matin',
  afternoon: 'Après-midi',
  full: 'Journée',
  evening: 'Soir',
};

/**
 * QR d'émargement par séance pour l'espace apprenant (principe « So Safe ») :
 * pour chaque feuille non finalisée des sessions de l'apprenant, génère un lien
 * de signature PERSONNALISÉ (JWT 24 h) et son QR (PNG data-URL). L'apprenant
 * scanne (ou tape) le QR → page /signer/[token] → signature enregistrée.
 * Retour : Map<sessionId, SessionSignatureQr[]>.
 */
export async function loadSessionSignatureQRs(token: string): Promise<Map<string, SessionSignatureQr[]>> {
  const out = new Map<string, SessionSignatureQr[]>();
  const verified = await verifyApprenantToken(token);
  if (!verified.ok || !env.PUBLIC_APP_URL) return out;

  const { learnerId, dossierId } = verified.value;
  const admin = supabaseAdmin();

  // Sessions du dossier (lien direct + table de jonction).
  const [byDirect, byJunction] = await Promise.all([
    admin.schema('app').from('sessions').select('id').eq('dossier_id', dossierId),
    admin.schema('app').from('session_dossiers' as never).select('session_id').eq('dossier_id', dossierId),
  ]);
  const sessionIds = new Set<string>();
  for (const r of (byDirect.data ?? []) as { id: string }[]) sessionIds.add(r.id);
  for (const r of (byJunction.data ?? []) as { session_id: string }[]) sessionIds.add(r.session_id);
  if (sessionIds.size === 0) return out;

  // Feuilles d'émargement encore signables (non finalisées).
  const { data: sheets } = await admin
    .schema('app')
    .from('attendance_sheets')
    .select('id, session_id, half_day, status')
    .in('session_id', [...sessionIds])
    .neq('status', 'finalized');
  const sheetRows = (sheets ?? []) as { id: string; session_id: string; half_day: string; status: string }[];
  if (sheetRows.length === 0) return out;

  // Signatures déjà posées par cet apprenant → badge « Signé ».
  const { data: sigs } = await admin
    .schema('app')
    .from('attendance_signatures')
    .select('attendance_sheet_id, signed_at, exit_signed_at')
    .in('attendance_sheet_id', sheetRows.map((s) => s.id))
    .eq('participant_kind', 'learner')
    .eq('learner_id', learnerId);
  const signedSet = new Set<string>();
  // Terminé quand l'entrée ET la sortie sont signées.
  for (const s of (sigs ?? []) as unknown as { attendance_sheet_id: string; signed_at: string | null; exit_signed_at: string | null }[]) {
    if (s.signed_at && s.exit_signed_at) signedSet.add(s.attendance_sheet_id);
  }

  for (const sheet of sheetRows) {
    const lien = await issueAttendanceLink({
      sheetId: sheet.id,
      signerId: learnerId,
      signerKind: 'learner',
      baseUrl: env.PUBLIC_APP_URL,
      channel: 'espace',
    });
    if (!lien.ok) continue;
    const url = lien.link.url;
    const png = await renderQrPng(url, { width: 240 });
    const qrDataUrl = `data:image/png;base64,${png.toString('base64')}`;
    const arr = out.get(sheet.session_id) ?? [];
    arr.push({
      sheetId: sheet.id,
      halfDay: sheet.half_day,
      status: sheet.status,
      qrDataUrl,
      url,
      alreadySigned: signedSet.has(sheet.id),
    });
    out.set(sheet.session_id, arr);
  }
  return out;
}
