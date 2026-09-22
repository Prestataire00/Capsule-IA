import 'server-only';
import { supabaseAdmin } from '@/shared/lib/supabase/admin';
import type { SupabaseClient } from '@supabase/supabase-js';
import { sendEmail } from '@/shared/lib/email/resend';
import { env } from '@/env.mjs';

type DemandeSummary = {
  name: string;
  situationLabel: string;
  companyName: string | null;
  employeesCount: number | null;
};

type Recipient = { user_id: string; email: string };

function buildHtml(s: DemandeSummary, url: string | null): string {
  const lines = [
    `<strong>${s.name}</strong>`,
    s.companyName ? `Entreprise : ${s.companyName}` : null,
    `Situation : ${s.situationLabel}`,
    s.employeesCount ? `${s.employeesCount} salarié(s) à inscrire` : null,
  ].filter(Boolean);
  return `<!DOCTYPE html><html><body style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;background:#fafafa;padding:32px;">
<div style="max-width:520px;margin:auto;background:#fff;border:1px solid #e4e4e7;border-radius:12px;padding:28px;">
<h1 style="font-size:18px;margin:0 0 8px;">Nouvelle demande d'inscription</h1>
<p style="color:#3f3f46;font-size:14px;line-height:1.6;">${lines.join('<br>')}</p>
<p style="color:#3f3f46;font-size:14px;">Vérifiez les pièces justificatives et validez la demande.</p>
${url ? `<a href="${url}" style="display:inline-block;margin-top:8px;background:#7c3aed;color:#fff;text-decoration:none;font-size:14px;padding:10px 18px;border-radius:8px;">Ouvrir la demande</a>` : ''}
<p style="color:#a1a1aa;font-size:11px;margin-top:16px;">Capsule IA</p></div></body></html>`;
}

/**
 * Notifie le staff (owner/admin/gestionnaire) de l'org d'une nouvelle demande :
 * notifications in-app (1 par destinataire) + emails. Non-bloquant.
 * Fallback à OF_NOTIFICATION_EMAIL si pas d'org (prospect non assigné).
 */
export async function notifyOrgStaffOfNewDemande(args: {
  organizationId: string | null;
  prospectId: string;
  replyTo?: string;
  summary: DemandeSummary;
  /**
   * Membre à ne pas prévenir par e-mail : celui qui vient de saisir la demande.
   * On n'écrit pas à quelqu'un pour lui annoncer ce qu'il vient de faire. La
   * notification in-app, elle, reste org-wide — c'est une seule ligne pour tous.
   */
  exclureUserId?: string | null;
}): Promise<void> {
  try {
    await deliver(args);
  } catch (e) {
    console.error('[notify-staff] delivery failed', e);
  }
}

async function deliver(args: {
  organizationId: string | null;
  prospectId: string;
  replyTo?: string;
  summary: DemandeSummary;
  exclureUserId?: string | null;
}): Promise<void> {
  const url = env.PUBLIC_APP_URL
    ? `${env.PUBLIC_APP_URL.replace(/\/$/, '')}/prospects/${args.prospectId}`
    : null;
  const html = buildHtml(args.summary, url);
  const subject = `Nouvelle demande — ${args.summary.companyName ?? args.summary.name}`;
  const admin = supabaseAdmin() as unknown as SupabaseClient;

  // In-app : UNE seule notification org-wide (la page Notifications est un inbox
  // partagé staff, sans filtre par destinataire → 1 ligne = 1 notif pour tous).
  if (args.organizationId) {
    await admin
      .schema('app')
      .from('notifications')
      .insert({
        organization_id: args.organizationId,
        channel: 'in_app',
        template_code: 'prospect.new_demande',
        subject,
        payload: {
          prospect_id: args.prospectId,
          name: args.summary.name,
          company_name: args.summary.companyName,
        },
        status: 'sent',
        sent_at: new Date().toISOString(),
        related_aggregate_type: 'prospect',
        related_aggregate_id: args.prospectId,
      } as never);
  }

  // Emails : à chaque membre owner/admin/gestionnaire (sinon email global de l'OF).
  let recipients: Recipient[] = [];
  if (args.organizationId) {
    const { data } = await admin
      .schema('app')
      .rpc('staff_recipients', { p_org: args.organizationId } as never);
    recipients = ((data as Recipient[] | null) ?? []).filter(
      (r) => r.email && r.user_id !== args.exclureUserId,
    );
  }

  if (recipients.length === 0) {
    if (env.OF_NOTIFICATION_EMAIL) {
      void sendEmail({
        to: env.OF_NOTIFICATION_EMAIL,
        subject,
        html,
        replyTo: args.replyTo,
        kind: 'nouvelle_demande',
      }).then((r) => {
        if (!r.ok) console.error('[notify-staff] fallback email failed', r);
      });
    }
    return;
  }

  void Promise.all(
    recipients.map((r) =>
      sendEmail({
        to: r.email,
        subject,
        html,
        replyTo: args.replyTo,
        kind: 'nouvelle_demande',
        ...(args.organizationId ? { organizationId: args.organizationId } : {}),
      }).then((res) => {
        if (!res.ok) console.error('[notify-staff] email failed', r.email, res);
      }),
    ),
  );
}

/**
 * Le client a rempli sa fiche besoin : l'organisme doit l'apprendre.
 *
 * Le lien part, le client répond… et rien ne se passait. Il fallait rouvrir la
 * demande au hasard pour découvrir la réponse — celle de juillet est restée
 * plusieurs semaines sans que personne ne la voie. Même canal que la nouvelle
 * demande : une notification partagée dans l'inbox du staff, et un e-mail à
 * chaque membre qui suit les demandes.
 */
export async function notifyOrgStaffOfFicheBesoin(args: {
  organizationId: string | null;
  prospectId: string;
  /** Qui a répondu, tel qu'il figure sur la demande. */
  nom: string;
  formation: string | null;
}): Promise<void> {
  try {
    const url = env.PUBLIC_APP_URL
      ? `${env.PUBLIC_APP_URL.replace(/\/$/, '')}/prospects/${args.prospectId}`
      : null;
    const subject = `Fiche besoin complétée — ${args.nom}`;
    const html = `<!DOCTYPE html><html><body style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;background:#fafafa;padding:32px;">
<div style="max-width:520px;margin:auto;background:#fff;border:1px solid #e4e4e7;border-radius:12px;padding:28px;">
<h1 style="font-size:18px;margin:0 0 8px;">Fiche besoin complétée</h1>
<p style="color:#3f3f46;font-size:14px;line-height:1.6;"><strong>${args.nom}</strong>${
      args.formation ? `<br>Formation : ${args.formation}` : ''
    }<br>Ses objectifs et ses attentes sont enregistrés sur la demande.</p>
${url ? `<a href="${url}" style="display:inline-block;margin-top:8px;background:#f97316;color:#fff;text-decoration:none;font-size:14px;padding:10px 18px;border-radius:8px;">Ouvrir la demande</a>` : ''}
<p style="color:#a1a1aa;font-size:11px;margin-top:16px;">Capsule IA</p></div></body></html>`;

    const admin = supabaseAdmin() as unknown as SupabaseClient;

    if (args.organizationId) {
      await admin
        .schema('app')
        .from('notifications')
        .insert({
          organization_id: args.organizationId,
          channel: 'in_app',
          template_code: 'prospect.fiche_besoin_remplie',
          subject,
          payload: { prospect_id: args.prospectId, name: args.nom, formation: args.formation },
          status: 'sent',
          sent_at: new Date().toISOString(),
          related_aggregate_type: 'prospect',
          related_aggregate_id: args.prospectId,
        } as never);
    }

    let recipients: Recipient[] = [];
    if (args.organizationId) {
      const { data } = await admin
        .schema('app')
        .rpc('staff_recipients', { p_org: args.organizationId } as never);
      recipients = ((data as Recipient[] | null) ?? []).filter((r) => r.email);
    }

    const destinataires = recipients.length
      ? recipients.map((r) => r.email)
      : env.OF_NOTIFICATION_EMAIL
        ? [env.OF_NOTIFICATION_EMAIL]
        : [];

    await Promise.all(
      destinataires.map((to) =>
        sendEmail({
          to,
          subject,
          html,
          kind: 'fiche_besoin_completee',
          ...(args.organizationId ? { organizationId: args.organizationId } : {}),
        }).then((res) => {
          if (!res.ok && res.reason !== 'no_api_key') {
            console.error('[notify-staff] fiche besoin : e-mail non parti', to, res);
          }
        }),
      ),
    );
  } catch (e) {
    // Prévenir est un service rendu, pas une condition : la réponse du client
    // est déjà enregistrée, son échec ici ne doit rien casser.
    console.error('[notify-staff] fiche besoin : notification impossible', e);
  }
}
