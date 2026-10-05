import 'server-only';
import { supabaseAdmin } from '@/shared/lib/supabase/admin';
import { env } from '@/env.mjs';
import { sendEmail } from '@/shared/lib/email/resend';
import { contenuAValiderEmail } from '@/shared/lib/email/templates';
import { loadDestinatairesValidation } from './validation-recipients';
import { heure, jourLong } from './dates';

/**
 * Prévenir, sinon la validation ne sert à rien.
 *
 * Un contenu en attente que personne ne voit bloque le formateur la veille de
 * sa séance ; un refus que le formateur ignore ne sera jamais corrigé. Les deux
 * bouts de la chaîne sont donc notifiés. Au dépôt, les validateurs désignés
 * (sinon la direction) reçoivent aussi un e-mail, la copie en cc (0203).
 */

type Admin = ReturnType<typeof supabaseAdmin>;

async function insertNotifications(
  admin: Admin,
  rows: Array<Record<string, unknown>>,
): Promise<void> {
  if (rows.length === 0) return;
  const { error } = await admin.schema('app').from('notifications').insert(rows as never);
  if (error) console.error('[supports] notification non enregistrée', error.message);
}

async function contexteSeance(
  admin: Admin,
  sessionId: string | null,
): Promise<{ formationTitle: string | null; seanceLabel: string | null }> {
  if (!sessionId) return { formationTitle: null, seanceLabel: null };
  const { data } = await admin
    .schema('app')
    .from('sessions')
    .select('title, starts_at, ends_at, formation_id')
    .eq('id', sessionId)
    .maybeSingle();
  const s = data as { title: string | null; starts_at: string; ends_at: string; formation_id: string | null } | null;
  if (!s) return { formationTitle: null, seanceLabel: null };
  const { data: f } = s.formation_id
    ? await admin.schema('app').from('formations').select('title').eq('id', s.formation_id).maybeSingle()
    : { data: null };
  return {
    formationTitle: (f as { title: string } | null)?.title ?? s.title,
    seanceLabel: `${jourLong(s.starts_at)} · ${heure(s.starts_at)} – ${heure(s.ends_at)}`,
  };
}

export async function notifySupportDepose(input: {
  organizationId: string;
  resourceId: string;
  /** Séance du contenu ; null pour un cours rattaché à un dossier. */
  sessionId: string | null;
  title: string;
  trainerName: string;
  nature?: 'support' | 'cours';
}): Promise<void> {
  const admin = supabaseAdmin();
  const nature = input.nature ?? 'support';
  const { validateurs, copie } = await loadDestinatairesValidation(input.organizationId);
  const maintenant = new Date().toISOString();
  const libelle = nature === 'cours' ? 'Cours à valider' : 'Support à valider';

  await insertNotifications(
    admin,
    [...validateurs, ...copie].map((p) => ({
      organization_id: input.organizationId,
      channel: 'in_app',
      template_code: 'support.pending_validation',
      recipient_user_id: p.userId,
      subject: `${libelle} : ${input.title}`,
      payload: {
        support_id: input.resourceId,
        session_id: input.sessionId,
        title: input.title,
        trainer_name: input.trainerName,
        nature,
      },
      status: 'sent',
      sent_at: maintenant,
      related_aggregate_type: nature === 'cours' ? 'exercise' : 'session_resource',
      related_aggregate_id: input.resourceId,
    })),
  );

  const a = validateurs.map((p) => p.email).filter((e): e is string => Boolean(e));
  if (a.length === 0) {
    console.error('[supports] aucun validateur joignable par e-mail', input.organizationId);
    return;
  }
  const cc = copie.map((p) => p.email).filter((e): e is string => Boolean(e));
  const { subject, html } = contenuAValiderEmail({
    nature,
    title: input.title,
    trainerName: input.trainerName,
    ...(await contexteSeance(admin, input.sessionId)),
    validationUrl: `${(env.PUBLIC_APP_URL ?? '').replace(/\/$/, '')}/supports`,
  });
  const envoi = await sendEmail({
    to: a,
    cc,
    subject,
    html,
    organizationId: input.organizationId,
    kind: 'contenu_a_valider',
    metadata: { resource_id: input.resourceId, nature },
  });
  if (!envoi.ok) console.error('[supports] e-mail de validation non parti', envoi.reason);
}

export async function notifySupportDecide(input: {
  organizationId: string;
  trainerUserId: string | null;
  resourceId: string;
  sessionId: string;
  title: string;
  decision: 'valide' | 'refuse';
  reason?: string | null;
}): Promise<void> {
  if (!input.trainerUserId) return;
  const valide = input.decision === 'valide';

  await insertNotifications(supabaseAdmin(), [
    {
      organization_id: input.organizationId,
      channel: 'in_app',
      template_code: valide ? 'support.validated' : 'support.rejected',
      recipient_user_id: input.trainerUserId,
      subject: valide ? `Support validé : ${input.title}` : `Support refusé : ${input.title}`,
      payload: {
        support_id: input.resourceId,
        session_id: input.sessionId,
        title: input.title,
        reason: input.reason ?? null,
      },
      status: 'sent',
      sent_at: new Date().toISOString(),
      related_aggregate_type: 'session_resource',
      related_aggregate_id: input.resourceId,
    },
  ]);
}
