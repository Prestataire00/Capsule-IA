import 'server-only';
import { env } from '@/env.mjs';
import { supabaseAdmin } from '@/shared/lib/supabase/admin';
import { sendEmail } from '@/shared/lib/email/resend';
import { mentionEquipeEmail } from '@/shared/lib/email/templates';
import { mentionsDans } from './mentions';
import { equipeDuDossier, libellesDossiers, type LibelleDossier, type MembreDiscussion } from './equipe';

/**
 * Discussion d'équipe par dossier (0204). Lectures et écritures en service
 * role : l'appelant a vérifié avant que le dossier est le sien (équipe de
 * l'organisme, ou formateur du dossier).
 */

export type MessageEquipe = {
  readonly id: string;
  readonly authorUserId: string | null;
  readonly authorName: string;
  readonly body: string;
  readonly mentions: readonly string[];
  readonly createdAt: string;
};

export async function loadMessagesEquipe(dossierId: string): Promise<MessageEquipe[]> {
  const { data, error } = await supabaseAdmin()
    .schema('app')
    .from('dossier_team_messages' as never)
    .select('id, author_user_id, author_name, body, mentions, created_at')
    .eq('dossier_id', dossierId)
    .is('deleted_at', null)
    .order('created_at', { ascending: true })
    .limit(500);
  if (error) throw new Error(`[discussion] lecture impossible : ${error.message}`);
  return ((data ?? []) as unknown as Array<{
    id: string;
    author_user_id: string | null;
    author_name: string;
    body: string;
    mentions: string[] | null;
    created_at: string;
  }>).map((m) => ({
    id: m.id,
    authorUserId: m.author_user_id,
    authorName: m.author_name,
    body: m.body,
    mentions: m.mentions ?? [],
    createdAt: m.created_at,
  }));
}

export type Fil = {
  readonly dossier: LibelleDossier;
  readonly dernierMessage: { authorName: string; body: string; createdAt: string } | null;
  readonly nonLus: number;
  readonly mentionsNonLues: number;
};

/**
 * Les fils visibles par cette personne, le plus récent d'abord. Pour un
 * formateur, `dossierIds` borne la liste à ses dossiers.
 */
export async function loadFils(input: {
  organizationId: string | null;
  dossierIds: readonly string[] | null;
  userId: string;
}): Promise<Fil[]> {
  const admin = supabaseAdmin();
  let q = admin
    .schema('app')
    .from('dossier_team_messages' as never)
    .select('dossier_id, author_user_id, author_name, body, mentions, created_at')
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(2000);
  if (input.organizationId) q = q.eq('organization_id', input.organizationId);
  if (input.dossierIds) {
    if (input.dossierIds.length === 0) return [];
    q = q.in('dossier_id', [...input.dossierIds]);
  }
  const { data, error } = await q;
  if (error) throw new Error(`[discussion] fils illisibles : ${error.message}`);
  const messages = (data ?? []) as unknown as Array<{
    dossier_id: string;
    author_user_id: string | null;
    author_name: string;
    body: string;
    mentions: string[] | null;
    created_at: string;
  }>;

  const dossierIds = [...new Set(messages.map((m) => m.dossier_id))];
  const [libelles, { data: lectures }] = await Promise.all([
    libellesDossiers(dossierIds),
    dossierIds.length
      ? admin
          .schema('app')
          .from('dossier_team_reads' as never)
          .select('dossier_id, last_read_at')
          .eq('user_id', input.userId)
          .in('dossier_id', dossierIds)
      : Promise.resolve({ data: [] }),
  ]);
  const lu = new Map(
    ((lectures ?? []) as unknown as Array<{ dossier_id: string; last_read_at: string }>).map((r) => [r.dossier_id, r.last_read_at]),
  );

  return dossierIds.flatMap((id) => {
    const dossier = libelles.get(id);
    if (!dossier) return [];
    const duFil = messages.filter((m) => m.dossier_id === id);
    const depuis = lu.get(id);
    const nouveaux = duFil.filter((m) => m.author_user_id !== input.userId && (!depuis || m.created_at > depuis));
    const dernier = duFil[0];
    return [
      {
        dossier,
        dernierMessage: dernier ? { authorName: dernier.author_name, body: dernier.body, createdAt: dernier.created_at } : null,
        nonLus: nouveaux.length,
        mentionsNonLues: nouveaux.filter((m) => (m.mentions ?? []).includes(input.userId)).length,
      },
    ];
  });
}

export async function marquerFilLu(userId: string, dossierId: string): Promise<void> {
  const { error } = await supabaseAdmin()
    .schema('app')
    .from('dossier_team_reads' as never)
    .upsert({ user_id: userId, dossier_id: dossierId, last_read_at: new Date().toISOString() } as never, {
      onConflict: 'user_id,dossier_id',
    });
  if (error) console.error('[discussion] lecture non notée', dossierId, error.message);
}

export type ResultatEnvoi = { ok: true } | { ok: false; error: string };

/**
 * Publie un message et prévient les personnes mentionnées : dans la cloche,
 * et par e-mail. Un message sans mention est refusé : on ne parle pas à
 * la cantonade.
 */
export async function publierMessageEquipe(input: {
  organizationId: string;
  dossierId: string;
  authorUserId: string;
  authorName: string;
  body: string;
}): Promise<ResultatEnvoi> {
  const equipe = await equipeDuDossier(input.organizationId, input.dossierId);
  const mentions = mentionsDans(
    input.body,
    equipe.filter((m) => m.userId !== input.authorUserId),
  );
  if (mentions.length === 0) {
    return { ok: false, error: 'Mentionnez au moins une personne de l’équipe avec @ (cliquez sur son nom).' };
  }

  const admin = supabaseAdmin();
  const { error } = await admin
    .schema('app')
    .from('dossier_team_messages' as never)
    .insert({
      organization_id: input.organizationId,
      dossier_id: input.dossierId,
      author_user_id: input.authorUserId,
      author_name: input.authorName,
      body: input.body,
      mentions,
    } as never);
  if (error) return { ok: false, error: "Le message n'a pas été envoyé." };
  await marquerFilLu(input.authorUserId, input.dossierId);

  const libelle = (await libellesDossiers([input.dossierId])).get(input.dossierId);
  await prevenirMentionnes(
    equipe.filter((m) => mentions.includes(m.userId)),
    { ...input, titre: libelle ? `${libelle.titre} (${libelle.reference})` : 'un dossier' },
  );
  return { ok: true };
}

async function prevenirMentionnes(
  personnes: readonly MembreDiscussion[],
  ctx: { organizationId: string; dossierId: string; authorName: string; body: string; titre: string },
): Promise<void> {
  const admin = supabaseAdmin();
  const maintenant = new Date().toISOString();
  const { error } = await admin
    .schema('app')
    .from('notifications')
    .insert(
      personnes.map((p) => ({
        organization_id: ctx.organizationId,
        channel: 'in_app',
        template_code: 'discussion.mention',
        recipient_user_id: p.userId,
        subject: `${ctx.authorName} vous a mentionné · ${ctx.titre}`,
        payload: { dossier_id: ctx.dossierId, author_name: ctx.authorName, extrait: ctx.body.slice(0, 280) },
        status: 'sent',
        sent_at: maintenant,
        related_aggregate_type: 'dossier',
        related_aggregate_id: ctx.dossierId,
      })) as never,
    );
  if (error) console.error('[discussion] mention non notée', error.message);

  const app = (env.PUBLIC_APP_URL ?? '').replace(/\/$/, '');
  for (const p of personnes) {
    if (!p.email) continue;
    const chemin = p.role === 'formateur' ? '/mes-discussions' : '/messagerie';
    const { subject, html } = mentionEquipeEmail({
      auteur: ctx.authorName,
      dossier: ctx.titre,
      message: ctx.body,
      lien: `${app}${chemin}?dossier=${ctx.dossierId}`,
    });
    const r = await sendEmail({
      to: p.email,
      subject,
      html,
      organizationId: ctx.organizationId,
      dossierId: ctx.dossierId,
      kind: 'discussion_mention',
    });
    if (!r.ok && r.reason !== 'no_api_key') console.error('[discussion] e-mail de mention non parti', r.reason);
  }
}
