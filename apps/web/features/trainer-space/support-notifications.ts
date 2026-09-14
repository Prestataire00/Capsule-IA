import 'server-only';
import { supabaseAdmin } from '@/shared/lib/supabase/admin';

/**
 * Prévenir, sinon la validation ne sert à rien.
 *
 * Un support en attente que personne ne voit bloque le formateur la veille de
 * sa séance ; un refus que le formateur ignore ne sera jamais corrigé. Les deux
 * bouts de la chaîne sont donc notifiés, en interne (cloche), sans e-mail.
 */

type Admin = ReturnType<typeof supabaseAdmin>;

async function adminUserIds(admin: Admin, organizationId: string): Promise<string[]> {
  const { data } = await admin
    .schema('app')
    .from('members')
    .select('user_id, role')
    .eq('organization_id', organizationId)
    .in('role', ['owner', 'admin'])
    .is('deleted_at', null);
  return [...new Set(((data ?? []) as Array<{ user_id: string }>).map((m) => m.user_id))];
}

async function insertNotifications(
  admin: Admin,
  rows: Array<Record<string, unknown>>,
): Promise<void> {
  if (rows.length === 0) return;
  const { error } = await admin.schema('app').from('notifications').insert(rows as never);
  if (error) console.error('[supports] notification non enregistrée', error.message);
}

export async function notifySupportDepose(input: {
  organizationId: string;
  resourceId: string;
  sessionId: string;
  title: string;
  trainerName: string;
}): Promise<void> {
  const admin = supabaseAdmin();
  const destinataires = await adminUserIds(admin, input.organizationId);
  const maintenant = new Date().toISOString();

  await insertNotifications(
    admin,
    destinataires.map((userId) => ({
      organization_id: input.organizationId,
      channel: 'in_app',
      template_code: 'support.pending_validation',
      recipient_user_id: userId,
      subject: `Support à valider : ${input.title}`,
      payload: {
        support_id: input.resourceId,
        session_id: input.sessionId,
        title: input.title,
        trainer_name: input.trainerName,
      },
      status: 'sent',
      sent_at: maintenant,
      related_aggregate_type: 'session_resource',
      related_aggregate_id: input.resourceId,
    })),
  );
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
