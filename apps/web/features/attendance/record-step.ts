import 'server-only';
import { createHash, randomUUID } from 'node:crypto';
import { headers } from 'next/headers';
import { supabaseAdmin } from '@/shared/lib/supabase/admin';
import { attendanceErrorCode } from './schemas';

/**
 * Enregistre une étape d'émargement (entrée ou sortie) : image, preuve, RPC.
 *
 * L'image est déposée sous un chemin propre à la tentative, sans écrasement :
 * un nouvel essai (ou une tentative refusée) ne remplace plus l'image d'une
 * signature valide. Si la base refuse, l'image déposée est retirée.
 *
 * L'empreinte porte sur l'image et le contexte (IP, navigateur, jeton, étape,
 * feuille, signataire), pas sur une heure calculée côté serveur Next — elle se
 * recalcule donc à partir de ce qui est conservé.
 */

const PREFIXE_PNG = 'data:image/png;base64,';
const PNG_MAX = 512 * 1024;

export type StepInput = {
  readonly sheetId: string;
  readonly signerId: string;
  readonly signerKind: 'learner' | 'trainer';
  readonly moment: 'entry' | 'exit';
  readonly dataUrl: string | null;
  readonly tokenJti: string | null;
  readonly captureMode: 'lien' | 'qr' | 'tablette' | 'visio';
  readonly actorUserId: string | null;
};

export type StepResult =
  | { ok: true; signedAt: string; status: string; lateArrival: string | null; earlyDeparture: string | null }
  | { ok: false; error: string };

function contexteRequete() {
  const h = headers();
  const ip =
    h.get('cf-connecting-ip') || h.get('x-forwarded-for')?.split(',')[0]?.trim() || h.get('x-real-ip') || '0.0.0.0';
  const userAgent = h.get('user-agent') ?? 'inconnu';
  const pays = h.get('cf-ipcountry');
  return { ip, userAgent, country: pays && pays !== 'XX' && pays.length === 2 ? pays.toUpperCase() : null };
}

export async function recordAttendanceStep(input: StepInput): Promise<StepResult> {
  let image: Buffer | null = null;
  if (input.dataUrl !== null) {
    if (!input.dataUrl.startsWith(PREFIXE_PNG)) return { ok: false, error: 'invalid_image_format' };
    image = Buffer.from(input.dataUrl.slice(PREFIXE_PNG.length), 'base64');
    if (image.length === 0) return { ok: false, error: 'empty_image' };
    if (image.length > PNG_MAX) return { ok: false, error: 'image_too_large' };
  }

  const { ip, userAgent, country } = contexteRequete();
  const hash = createHash('sha256')
    .update(image ?? 'confirmation-sans-trace')
    .update(`|${ip}|${userAgent}|${input.tokenJti ?? 'sans-jeton'}|${input.moment}|${input.sheetId}|${input.signerKind}|${input.signerId}`)
    .digest('hex');

  const sb = supabaseAdmin();
  const chemin = image ? `${input.sheetId}/${input.signerKind}/${input.signerId}/${input.moment}-${randomUUID()}.png` : null;
  if (image && chemin) {
    const { error } = await sb.storage.from('signatures').upload(chemin, image, { contentType: 'image/png', upsert: false });
    if (error) {
      console.error('[émargement] dépôt de la signature impossible', error);
      return { ok: false, error: 'storage_upload_failed' };
    }
  }

  const { data, error } = await sb.schema('app').rpc('record_attendance_step' as never, {
    p_attendance_sheet_id: input.sheetId,
    p_signer_id: input.signerId,
    p_signer_kind: input.signerKind,
    p_moment: input.moment,
    p_image_path: chemin,
    p_signature_hash: hash,
    p_signer_ip: ip,
    p_signer_user_agent: userAgent,
    p_signer_country: country,
    p_token_jti: input.tokenJti,
    p_capture_mode: input.captureMode,
    p_actor: input.actorUserId,
  } as never);

  if (error) {
    if (chemin) await sb.storage.from('signatures').remove([chemin]);
    const code = attendanceErrorCode(error.message);
    if (code === 'erreur_inconnue') console.error('[émargement] signature refusée', error);
    return { ok: false, error: code === 'erreur_inconnue' ? error.message : code };
  }

  const r = data as { signed_at: string; status: string; late_arrival_time: string | null; early_departure_time: string | null };
  return {
    ok: true,
    signedAt: r.signed_at,
    status: r.status,
    lateArrival: r.late_arrival_time?.slice(0, 5) ?? null,
    earlyDeparture: r.early_departure_time?.slice(0, 5) ?? null,
  };
}
