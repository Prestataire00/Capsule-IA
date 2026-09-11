'use server';

import { env } from '@/env.mjs';
import { supabaseAdmin } from '@/shared/lib/supabase/admin';
import { verifySignatureToken } from '@/shared/lib/signature-token';
import { generateApprenantUrl } from '@/shared/lib/apprenant-token';
import { recordAttendanceStep } from '@/features/attendance/record-step';

export type SignStepResult =
  | {
      ok: true;
      signedAt: string;
      status: string;
      lateArrival: string | null;
      earlyDeparture: string | null;
      /** Après la sortie : l'espace de formation de l'apprenant. */
      espaceUrl: string | null;
    }
  | { ok: false; error: string };

/**
 * Signature par lien personnel (ou QR, même URL) : entrée puis sortie.
 * Sans dessin, la confirmation n'est acceptée que pour une séance à distance
 * ou hybride (vérifié en base).
 *
 * Une fois l'entrée et la sortie signées, l'apprenant reçoit l'accès à son
 * espace de formation : avoir signé avec son lien personnel prouve qu'il le
 * détient (principe repris de SoSafe).
 */
export async function signStep(input: { token: string; moment: 'entry' | 'exit'; dataUrl: string | null }): Promise<SignStepResult> {
  const verified = await verifySignatureToken(input.token);
  if (!verified.ok) return { ok: false, error: verified.error };
  const { attendanceSheetId, signerId, signerKind, jti } = verified.value;
  if (input.moment !== 'entry' && input.moment !== 'exit') return { ok: false, error: 'invalid_moment' };

  const r = await recordAttendanceStep({
    sheetId: attendanceSheetId,
    signerId,
    signerKind,
    moment: input.moment,
    dataUrl: input.dataUrl,
    tokenJti: jti,
    captureMode: input.dataUrl ? 'lien' : 'visio',
    actorUserId: null,
  });
  if (!r.ok) return r;

  let espaceUrl: string | null = null;
  if (input.moment === 'exit' && signerKind === 'learner' && env.PUBLIC_APP_URL) {
    const { data } = await supabaseAdmin()
      .schema('app')
      .rpc('get_signature_context' as never, {
        p_attendance_sheet_id: attendanceSheetId,
        p_signer_id: signerId,
        p_signer_kind: signerKind,
      } as never)
      .maybeSingle();
    const ctx = data as { learner_dossier_id: string | null; organization_id: string } | null;
    if (ctx?.learner_dossier_id) {
      const espace = await generateApprenantUrl(
        { learnerId: signerId, organizationId: ctx.organization_id, dossierId: ctx.learner_dossier_id },
        env.PUBLIC_APP_URL,
      );
      espaceUrl = espace.url;
    }
  }

  return { ok: true, signedAt: r.signedAt, status: r.status, lateArrival: r.lateArrival, earlyDeparture: r.earlyDeparture, espaceUrl };
}
