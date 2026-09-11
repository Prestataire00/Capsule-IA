import 'server-only';
import { randomUUID } from 'node:crypto';
import { supabaseAdmin } from '@/shared/lib/supabase/admin';
import { isSelfSigned } from '@/features/attendance/completeness';
import {
  MAX_JUSTIFICATIONS_PER_SHEET,
  MAX_JUSTIFICATION_BYTES,
  cleanFileName,
  sniffJustification,
} from '@/features/attendance/justification-rules';

/**
 * Justificatifs d'absence : dépôt (apprenant ou équipe) et effet d'une
 * acceptation sur la feuille. Appelé uniquement après une garde (jeton de
 * l'apprenant, ou accès de l'équipe à la feuille).
 */

export const JUSTIFICATION_BUCKET = 'attendance-justifications';

export type StoreJustificationInput = {
  readonly organizationId: string;
  readonly sheetId: string;
  readonly learnerId: string;
  readonly file: File | null;
  readonly comment: string | null;
  readonly via: 'apprenant' | 'equipe';
  readonly actor: string | null;
};

export type StoreJustificationResult = { ok: true; id: string } | { ok: false; error: string };

export async function storeJustification(input: StoreJustificationInput): Promise<StoreJustificationResult> {
  if (!input.file || input.file.size === 0) return { ok: false, error: 'justification_missing' };
  if (input.file.size > MAX_JUSTIFICATION_BYTES) return { ok: false, error: 'justification_too_large' };
  const octets = new Uint8Array(await input.file.arrayBuffer());
  const type = sniffJustification(octets);
  if (!type) return { ok: false, error: 'justification_type' };
  if (input.via === 'equipe' && !input.actor) return { ok: false, error: 'forbidden' };

  const sb = supabaseAdmin();
  const { count } = await sb
    .schema('app')
    .from('attendance_justifications' as never)
    .select('id', { count: 'exact', head: true })
    .eq('attendance_sheet_id' as never, input.sheetId as never)
    .eq('learner_id' as never, input.learnerId as never);
  if ((count ?? 0) >= MAX_JUSTIFICATIONS_PER_SHEET) return { ok: false, error: 'justification_limit' };

  const id = randomUUID();
  const chemin = `${input.organizationId}/${input.sheetId}/${input.learnerId}/${id}.${type.ext}`;
  const up = await sb.storage.from(JUSTIFICATION_BUCKET).upload(chemin, octets, { contentType: type.mime, upsert: false });
  if (up.error) {
    console.error('[justificatif] dépôt refusé par le stockage', up.error.message);
    return { ok: false, error: 'justification_upload_failed' };
  }

  const equipe = input.via === 'equipe';
  const { error } = await sb
    .schema('app')
    .from('attendance_justifications' as never)
    .insert({
      id,
      organization_id: input.organizationId,
      attendance_sheet_id: input.sheetId,
      learner_id: input.learnerId,
      storage_path: chemin,
      file_name: cleanFileName(input.file.name, type.ext),
      mime_type: type.mime,
      size_bytes: octets.length,
      comment: input.comment?.trim().slice(0, 500) || null,
      submitted_via: input.via,
      submitted_by: equipe ? input.actor : null,
      // Déposé par l'équipe : elle l'a en main, il est accepté d'office.
      decision: equipe ? 'acceptee' : 'en_attente',
      decided_by: equipe ? input.actor : null,
      decided_at: equipe ? new Date().toISOString() : null,
    } as never);
  if (error) {
    console.error('[justificatif] enregistrement refusé', error);
    await sb.storage.from(JUSTIFICATION_BUCKET).remove([chemin]);
    return { ok: false, error: 'justification_upload_failed' };
  }
  return { ok: true, id };
}

/**
 * Justificatif accepté : l'absence devient « excusée » sur la feuille, si
 * elle est encore ouverte et que l'apprenant n'a pas signé lui-même (un
 * justificatif de retard ne transforme pas une présence en absence).
 * Retourne vrai si la feuille a été modifiée.
 */
export async function markJustifiedAbsence(input: { sheetId: string; learnerId: string; reason: string; actor: string }): Promise<boolean> {
  const sb = supabaseAdmin();
  const { data: feuille } = await sb.schema('app').from('attendance_sheets').select('status').eq('id', input.sheetId).maybeSingle();
  const statut = (feuille as { status: string } | null)?.status;
  if (!statut || statut === 'finalized' || statut === 'completed') return false;

  const { data: sig } = await sb
    .schema('app')
    .from('attendance_signatures')
    .select('signed_at, capture_mode, evidence_source, absence_reason')
    .eq('attendance_sheet_id', input.sheetId)
    .eq('participant_kind', 'learner')
    .eq('learner_id', input.learnerId)
    .maybeSingle();
  const g = sig as { signed_at: string | null; capture_mode: string | null; evidence_source: string | null; absence_reason: string | null } | null;
  if (g && isSelfSigned({ captureMode: g.capture_mode, evidenceSource: g.evidence_source, signedAt: g.signed_at })) return false;

  const { error } = await sb.schema('app').rpc('set_attendance_mark' as never, {
    p_attendance_sheet_id: input.sheetId,
    p_signer_id: input.learnerId,
    p_signer_kind: 'learner',
    p_status: 'absent_justified',
    p_late_arrival: null,
    p_early_departure: null,
    p_reason: g?.absence_reason || input.reason,
    p_capture_mode: 'grille',
    p_actor: input.actor,
  } as never);
  if (error) {
    console.error('[justificatif] absence non excusée', error);
    return false;
  }
  return true;
}
