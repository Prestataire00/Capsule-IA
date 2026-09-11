import 'server-only';
import { randomUUID } from 'node:crypto';
import { supabaseAdmin } from '@/shared/lib/supabase/admin';
import { generateSignatureToken } from '@/shared/lib/signature-token';

/**
 * Lien personnel d'émargement d'un participant pour une feuille.
 *
 * Le jeton est ENREGISTRÉ à l'émission, avec son canal et son émetteur :
 *  · `email`  — envoyé à l'apprenant par Capsule ;
 *  · `espace` — affiché dans l'espace de l'apprenant ;
 *  · `equipe` — copié ou imprimé (QR) par l'équipe ou le formateur ;
 *  · `salle`  — remis après le scan du QR projeté, lié au téléphone qui a scanné.
 * Un lien de l'équipe est tracé comme tel sur la signature, et n'ouvre jamais
 * l'espace apprenant (audit sécurité : qui détient le lien n'est pas forcément
 * l'apprenant).
 *
 * Il sert à l'entrée puis à la sortie, et vaut jusqu'à quatre heures après la
 * fin de la séance. Tant qu'un lien valide existe pour le même participant, la
 * même feuille, le même canal et le même émetteur, il est ré-émis à
 * l'identique plutôt que dupliqué.
 */

const MARGE_APRES_FIN_MS = 4 * 60 * 60 * 1000;
const VALIDITE_MIN_MS = 60 * 60 * 1000;
const REUTILISABLE_SI_RESTE_MS = 15 * 60 * 1000;

export type LinkChannel = 'email' | 'espace' | 'equipe' | 'salle';

export type AttendanceLinkInput = {
  readonly sheetId: string;
  readonly signerId: string;
  readonly signerKind: 'learner' | 'trainer';
  readonly baseUrl: string;
  readonly channel: LinkChannel;
  /** Utilisateur qui émet le lien (canal `equipe`). */
  readonly issuedBy?: string | null;
  /** Téléphone qui a scanné le QR projeté (canal `salle`). */
  readonly deviceId?: string | null;
};

export type AttendanceLink = { readonly url: string; readonly expiresAt: Date };

export type IssueLinkResult = { ok: true; link: AttendanceLink } | { ok: false; error: 'sheet_not_found' | 'register_failed' };

export async function issueAttendanceLink(input: AttendanceLinkInput): Promise<IssueLinkResult> {
  const sb = supabaseAdmin();

  const { data: sheet } = await sb
    .schema('app')
    .from('attendance_sheets')
    .select('organization_id, session:sessions(ends_at)')
    .eq('id', input.sheetId)
    .maybeSingle();
  const s = sheet as { organization_id: string; session: { ends_at: string } | { ends_at: string }[] | null } | null;
  const session = Array.isArray(s?.session) ? s?.session[0] : s?.session;
  if (!s || !session) return { ok: false, error: 'sheet_not_found' };

  const payload = { attendanceSheetId: input.sheetId, signerId: input.signerId, signerKind: input.signerKind };
  const url = (token: string) => `${input.baseUrl.replace(/\/$/, '')}/signer/${token}`;
  const emetteur = input.channel === 'equipe' ? (input.issuedBy ?? null) : null;
  const appareil = input.channel === 'salle' ? (input.deviceId ?? null) : null;
  if (input.channel === 'salle' && !appareil) return { ok: false, error: 'register_failed' };

  let q = sb
    .schema('app')
    .from('attendance_token_jtis' as never)
    .select('jti, expires_at')
    .eq('attendance_sheet_id' as never, input.sheetId as never)
    .eq('signer_id' as never, input.signerId as never)
    .eq('signer_kind' as never, input.signerKind as never)
    .eq('issued_channel' as never, input.channel as never)
    .eq('status' as never, 'issued' as never)
    .gt('expires_at' as never, new Date(Date.now() + REUTILISABLE_SI_RESTE_MS).toISOString() as never);
  q = emetteur ? q.eq('issued_by' as never, emetteur as never) : q.is('issued_by' as never, null);
  q = appareil ? q.eq('device_id' as never, appareil as never) : q.is('device_id' as never, null);
  const { data: existant } = await q.order('expires_at' as never, { ascending: false }).limit(1).maybeSingle();
  const reutilisable = existant as { jti: string; expires_at: string } | null;
  if (reutilisable) {
    const expiresAt = new Date(reutilisable.expires_at);
    const signed = await generateSignatureToken(payload, { jti: reutilisable.jti, expiresAt });
    return { ok: true, link: { url: url(signed.token), expiresAt } };
  }

  const expiresAt = new Date(Math.max(new Date(session.ends_at).getTime() + MARGE_APRES_FIN_MS, Date.now() + VALIDITE_MIN_MS));
  const jti = randomUUID();
  const { error } = await sb
    .schema('app')
    .from('attendance_token_jtis' as never)
    .insert({
      jti,
      organization_id: s.organization_id,
      attendance_sheet_id: input.sheetId,
      signer_id: input.signerId,
      signer_kind: input.signerKind,
      expires_at: expiresAt.toISOString(),
      issued_channel: input.channel,
      issued_by: emetteur,
      device_id: appareil,
    } as never);
  if (error) {
    console.error('[émargement] jeton non enregistré', error);
    return { ok: false, error: 'register_failed' };
  }
  const signed = await generateSignatureToken(payload, { jti, expiresAt });
  return { ok: true, link: { url: url(signed.token), expiresAt } };
}
