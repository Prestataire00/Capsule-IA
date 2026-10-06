'use server';

import { supabaseAdmin } from '@/shared/lib/supabase/admin';
import { verifySignatureToken } from '@/shared/lib/signature-token';
import { recordAttendanceStep } from '@/features/attendance/record-step';
import { ficheDePositionnement } from '@/features/questionnaire/needs-analysis';

export type SignStepResult =
  | {
      ok: true;
      signedAt: string;
      status: string;
      lateArrival: string | null;
      earlyDeparture: string | null;
      /** Fiche de positionnement pas encore remplie : il la remplit sur place. */
      ficheUrl: string | null;
    }
  | { ok: false; error: string };

/**
 * Signature par lien personnel (ou QR, même URL) : entrée puis sortie.
 * Sans tracé, la confirmation n'est acceptée que pour une séance entièrement
 * à distance (vérifié en base).
 *
 * L'accès à l'espace de formation n'est remis qu'au moment où CET appel
 * enregistre la sortie, et seulement pour un lien reçu par l'apprenant
 * (e-mail, espace) : un lien copié ou imprimé par l'équipe peut être entre
 * d'autres mains (audit sécurité).
 */
export async function signStep(input: { token: string; moment: 'entry' | 'exit'; dataUrl: string | null }): Promise<SignStepResult> {
  if (typeof input?.token !== 'string' || (input.moment !== 'entry' && input.moment !== 'exit')) {
    return { ok: false, error: 'invalid_payload' };
  }
  if (input.dataUrl !== null && (typeof input.dataUrl !== 'string' || input.dataUrl.length > 750_000)) {
    return { ok: false, error: 'image_too_large' };
  }
  const verified = await verifySignatureToken(input.token);
  if (!verified.ok) return { ok: false, error: verified.error };
  const { attendanceSheetId, signerId, signerKind, jti } = verified.value;

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

  let ficheUrl: string | null = null;
  const ctx =
    signerKind === 'learner'
      ? ((
          await supabaseAdmin()
            .schema('app')
            .rpc('get_signature_context' as never, {
              p_attendance_sheet_id: attendanceSheetId,
              p_signer_id: signerId,
              p_signer_kind: signerKind,
            } as never)
            .maybeSingle()
        ).data as { learner_dossier_id: string | null; organization_id: string; session_id: string | null } | null)
      : null;

  // Pas encore de fiche de positionnement : il la remplit dans la foulée, sur
  // le téléphone qui vient de signer — on n'a pas toujours son adresse. Un
  // stagiaire inscrit sans dossier a la sienne, rattachée à la séance.
  if (ctx) {
    const fiche = await ficheDePositionnement(supabaseAdmin() as never, {
      organizationId: ctx.organization_id,
      dossierId: ctx.learner_dossier_id,
      learnerId: signerId,
      sessionId: ctx.session_id,
    });
    if (fiche.statut === 'a_remplir') ficheUrl = fiche.url;
  }

  return { ok: true, signedAt: r.signedAt, status: r.status, lateArrival: r.lateArrival, earlyDeparture: r.earlyDeparture, ficheUrl };
}
