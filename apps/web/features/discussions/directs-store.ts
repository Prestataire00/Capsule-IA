import 'server-only';
import { env } from '@/env.mjs';
import { supabaseAdmin } from '@/shared/lib/supabase/admin';
import { sendEmail } from '@/shared/lib/email/resend';
import { messageDirectEmail } from '@/shared/lib/email/templates';
import { memesPersonnes, participantsValides, prevenirParEmail, type Interlocuteur } from './directs';
import type { MessageEquipe, ResultatEnvoi } from './store';

/**
 * Conversations directes, hors dossier (0217). Lectures et écritures en
 * service role : chaque fonction publique vérifie que la personne connectée
 * participe à la conversation, ou appartient à l'organisme, avant d'agir.
 */

type Admin = ReturnType<typeof supabaseAdmin>;

const ROLES_EQUIPE = ['owner', 'admin', 'gestionnaire', 'comptable', 'commercial'] as const;
const FONCTION: Record<string, string> = {
  owner: 'Direction',
  admin: 'Direction',
  gestionnaire: 'Gestion',
  comptable: 'Comptabilité',
  commercial: 'Commercial',
};

/**
 * Les personnes d'un organisme qui ont un compte : son équipe, et ses
 * formateurs. Un formateur ne voit que l'équipe — pas les autres formateurs.
 */
export async function interlocuteursDe(organizationId: string, opts: { avecFormateurs: boolean }): Promise<Interlocuteur[]> {
  const admin = supabaseAdmin();
  const [{ data: membres, error: e1 }, { data: formateurs, error: e2 }] = await Promise.all([
    admin
      .schema('app')
      .from('members')
      .select('user_id, role')
      .eq('organization_id', organizationId)
      .in('role', [...ROLES_EQUIPE, 'formateur'] as never)
      .is('deleted_at', null),
    opts.avecFormateurs
      ? admin
          .schema('app')
          .from('trainers')
          .select('user_id, first_name, last_name, email')
          .eq('organization_id', organizationId)
          .not('user_id', 'is', null)
          .is('deleted_at', null)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (e1) throw new Error(`[messages directs] membres illisibles : ${e1.message}`);
  if (e2) throw new Error(`[messages directs] formateurs illisibles : ${e2.message}`);

  const equipe = ((membres ?? []) as Array<{ user_id: string; role: string }>).filter(
    (m) => m.role !== 'formateur' || opts.avecFormateurs,
  );
  const ids = [...new Set(equipe.map((m) => m.user_id))];
  const { data: profils } = ids.length
    ? await admin.schema('app').from('profiles').select('user_id, full_name, email').in('user_id', ids)
    : { data: [] };
  const profil = new Map(
    ((profils ?? []) as Array<{ user_id: string; full_name: string | null; email: string | null }>).map((p) => [p.user_id, p]),
  );

  const parId = new Map<string, Interlocuteur>();
  for (const m of equipe) {
    if (m.role === 'formateur') continue;
    const p = profil.get(m.user_id);
    parId.set(m.user_id, {
      userId: m.user_id,
      nom: p?.full_name?.trim() || p?.email || 'Membre',
      fonction: FONCTION[m.role] ?? 'Équipe',
      role: 'equipe',
      email: p?.email ?? null,
    });
  }
  const fiches = (formateurs ?? []) as Array<{ user_id: string; first_name: string | null; last_name: string | null; email: string | null }>;
  for (const f of fiches) {
    if (parId.has(f.user_id)) continue;
    parId.set(f.user_id, {
      userId: f.user_id,
      nom: `${f.first_name ?? ''} ${f.last_name ?? ''}`.trim() || f.email || 'Formateur',
      fonction: 'Formateur',
      role: 'formateur',
      email: f.email,
    });
  }
  // Un membre au rôle formateur sans fiche reste joignable.
  for (const m of equipe) {
    if (m.role !== 'formateur' || parId.has(m.user_id)) continue;
    const p = profil.get(m.user_id);
    parId.set(m.user_id, {
      userId: m.user_id,
      nom: p?.full_name?.trim() || p?.email || 'Formateur',
      fonction: 'Formateur',
      role: 'formateur',
      email: p?.email ?? null,
    });
  }
  return [...parId.values()].sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));
}

export type ConversationDirecte = {
  readonly id: string;
  readonly organizationId: string;
  readonly autres: readonly Interlocuteur[];
  readonly dernierMessage: { authorName: string; body: string; createdAt: string } | null;
  readonly nonLus: number;
};

/** Qui est qui dans un organisme : l'équipe et les formateurs, pour nommer les participants. */
async function annuaire(organizationIds: readonly string[]): Promise<Map<string, Map<string, Interlocuteur>>> {
  const out = new Map<string, Map<string, Interlocuteur>>();
  for (const org of new Set(organizationIds)) {
    const liste = await interlocuteursDe(org, { avecFormateurs: true });
    out.set(org, new Map(liste.map((i) => [i.userId, i])));
  }
  return out;
}

async function nomsInconnus(admin: Admin, ids: readonly string[]): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const { data } = await admin.schema('app').from('profiles').select('user_id, full_name, email').in('user_id', [...ids]);
  return new Map(
    ((data ?? []) as Array<{ user_id: string; full_name: string | null; email: string | null }>).map((p) => [
      p.user_id,
      p.full_name?.trim() || p.email || 'Ancien membre',
    ]),
  );
}

/** Les conversations de cette personne, la plus récente d'abord. */
export async function loadConversations(userId: string, organizationIds: readonly string[]): Promise<ConversationDirecte[]> {
  if (organizationIds.length === 0) return [];
  const admin = supabaseAdmin();
  const { data: miennes, error } = await admin
    .schema('app')
    .from('direct_participants' as never)
    .select('conversation_id, last_read_at')
    .eq('user_id', userId);
  if (error) throw new Error(`[messages directs] conversations illisibles : ${error.message}`);
  const lu = new Map(
    ((miennes ?? []) as unknown as Array<{ conversation_id: string; last_read_at: string | null }>).map((m) => [m.conversation_id, m.last_read_at]),
  );
  const ids = [...lu.keys()];
  if (ids.length === 0) return [];

  const [{ data: convs }, { data: participants }, { data: messages }] = await Promise.all([
    admin
      .schema('app')
      .from('direct_conversations' as never)
      .select('id, organization_id, created_at, last_message_at')
      .in('id', ids)
      .in('organization_id', [...organizationIds]),
    admin.schema('app').from('direct_participants' as never).select('conversation_id, user_id').in('conversation_id', ids),
    admin
      .schema('app')
      .from('direct_messages' as never)
      .select('conversation_id, author_user_id, author_name, body, created_at')
      .in('conversation_id', ids)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(3000),
  ]);
  const conversations = (convs ?? []) as unknown as Array<{
    id: string;
    organization_id: string;
    created_at: string;
    last_message_at: string | null;
  }>;
  const lignes = (participants ?? []) as unknown as Array<{ conversation_id: string; user_id: string }>;
  const msgs = (messages ?? []) as unknown as Array<{
    conversation_id: string;
    author_user_id: string | null;
    author_name: string;
    body: string;
    created_at: string;
  }>;

  const qui = await annuaire(conversations.map((c) => c.organization_id));
  const inconnus = lignes
    .filter((l) => l.user_id !== userId)
    .filter((l) => {
      const org = conversations.find((c) => c.id === l.conversation_id)?.organization_id;
      return !org || !qui.get(org)?.has(l.user_id);
    })
    .map((l) => l.user_id);
  const autresNoms = await nomsInconnus(admin, [...new Set(inconnus)]);

  return conversations
    .map((c) => {
      const autres = lignes
        .filter((l) => l.conversation_id === c.id && l.user_id !== userId)
        .map(
          (l): Interlocuteur =>
            qui.get(c.organization_id)?.get(l.user_id) ?? {
              userId: l.user_id,
              nom: autresNoms.get(l.user_id) ?? 'Ancien membre',
              fonction: 'Ne fait plus partie de l’organisme',
              role: 'equipe',
              email: null,
            },
        );
      const duFil = msgs.filter((m) => m.conversation_id === c.id);
      const depuis = lu.get(c.id) ?? null;
      const dernier = duFil[0];
      return {
        id: c.id,
        organizationId: c.organization_id,
        autres,
        dernierMessage: dernier ? { authorName: dernier.author_name, body: dernier.body, createdAt: dernier.created_at } : null,
        nonLus: duFil.filter((m) => m.author_user_id !== userId && (!depuis || m.created_at > depuis)).length,
        trie: c.last_message_at ?? c.created_at,
      };
    })
    .sort((a, b) => b.trie.localeCompare(a.trie))
    .map(({ trie: _trie, ...c }) => c);
}

/** La personne participe-t-elle à cette conversation ? */
export async function accesConversation(
  conversationId: string,
  userId: string,
): Promise<{ ok: true; organizationId: string } | { ok: false }> {
  if (!/^[0-9a-f-]{36}$/i.test(conversationId)) return { ok: false };
  const admin = supabaseAdmin();
  const [{ data: p }, { data: c }] = await Promise.all([
    admin
      .schema('app')
      .from('direct_participants' as never)
      .select('user_id')
      .eq('conversation_id', conversationId)
      .eq('user_id', userId)
      .maybeSingle(),
    admin.schema('app').from('direct_conversations' as never).select('organization_id').eq('id', conversationId).maybeSingle(),
  ]);
  if (!p || !c) return { ok: false };
  return { ok: true, organizationId: (c as unknown as { organization_id: string }).organization_id };
}

export async function loadMessagesDirects(conversationId: string): Promise<MessageEquipe[]> {
  const { data, error } = await supabaseAdmin()
    .schema('app')
    .from('direct_messages' as never)
    .select('id, author_user_id, author_name, body, created_at')
    .eq('conversation_id', conversationId)
    .is('deleted_at', null)
    .order('created_at', { ascending: true })
    .limit(500);
  if (error) throw new Error(`[messages directs] lecture impossible : ${error.message}`);
  return ((data ?? []) as unknown as Array<{
    id: string;
    author_user_id: string | null;
    author_name: string;
    body: string;
    created_at: string;
  }>).map((m) => ({
    id: m.id,
    authorUserId: m.author_user_id,
    authorName: m.author_name,
    body: m.body,
    mentions: [],
    createdAt: m.created_at,
  }));
}

export async function marquerConversationLue(conversationId: string, userId: string): Promise<void> {
  const { error } = await supabaseAdmin()
    .schema('app')
    .from('direct_participants' as never)
    .update({ last_read_at: new Date().toISOString() } as never)
    .eq('conversation_id', conversationId)
    .eq('user_id', userId);
  if (error) console.error('[messages directs] lecture non notée', conversationId, error.message);
}

/**
 * Ouvre la conversation avec ces personnes : celle qui existe déjà avec
 * exactement les mêmes participants, sinon une nouvelle.
 */
export async function ouvrirConversation(input: {
  organizationId: string;
  auteurId: string;
  avec: readonly string[];
  joignables: readonly string[];
}): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const v = participantsValides(input.auteurId, input.avec, input.joignables);
  if (!v.ok) return v;
  const tous = [input.auteurId, ...v.ids];
  const admin = supabaseAdmin();

  const { data: miennes } = await admin
    .schema('app')
    .from('direct_participants' as never)
    .select('conversation_id')
    .eq('user_id', input.auteurId);
  const candidates = ((miennes ?? []) as unknown as Array<{ conversation_id: string }>).map((m) => m.conversation_id);
  if (candidates.length > 0) {
    const [{ data: convs }, { data: lignes }] = await Promise.all([
      admin
        .schema('app')
        .from('direct_conversations' as never)
        .select('id')
        .in('id', candidates)
        .eq('organization_id', input.organizationId),
      admin.schema('app').from('direct_participants' as never).select('conversation_id, user_id').in('conversation_id', candidates),
    ]);
    const parConv = new Map<string, string[]>();
    for (const l of (lignes ?? []) as unknown as Array<{ conversation_id: string; user_id: string }>) {
      parConv.set(l.conversation_id, [...(parConv.get(l.conversation_id) ?? []), l.user_id]);
    }
    const existante = ((convs ?? []) as unknown as Array<{ id: string }>).find((c) => memesPersonnes(parConv.get(c.id) ?? [], tous));
    if (existante) return { ok: true, id: existante.id };
  }

  const { data: creee, error } = await admin
    .schema('app')
    .from('direct_conversations' as never)
    .insert({ organization_id: input.organizationId, created_by: input.auteurId } as never)
    .select('id')
    .single();
  if (error || !creee) return { ok: false, error: 'La conversation n’a pas pu être ouverte.' };
  const id = (creee as unknown as { id: string }).id;
  const { error: e2 } = await admin
    .schema('app')
    .from('direct_participants' as never)
    .insert(tous.map((u) => ({ conversation_id: id, user_id: u, last_read_at: u === input.auteurId ? new Date().toISOString() : null })) as never);
  if (e2) {
    await admin.schema('app').from('direct_conversations' as never).delete().eq('id', id);
    return { ok: false, error: 'La conversation n’a pas pu être ouverte.' };
  }
  return { ok: true, id };
}

/**
 * Publie un message et prévient les autres participants : dans la cloche à
 * chaque message, par e-mail au premier message qu'ils n'ont pas encore lu.
 * `cheminDe` donne l'adresse de la messagerie de chacun (équipe ou formateur).
 */
export async function publierMessageDirect(input: {
  conversationId: string;
  organizationId: string;
  auteurId: string;
  auteurNom: string;
  body: string;
  cheminDe: (userId: string) => string;
}): Promise<ResultatEnvoi> {
  const admin = supabaseAdmin();
  const [{ data: conv }, { data: participants }] = await Promise.all([
    admin.schema('app').from('direct_conversations' as never).select('last_message_at').eq('id', input.conversationId).maybeSingle(),
    admin.schema('app').from('direct_participants' as never).select('user_id, last_read_at').eq('conversation_id', input.conversationId),
  ]);
  const dernierAvant = (conv as unknown as { last_message_at: string | null } | null)?.last_message_at ?? null;
  const autres = ((participants ?? []) as unknown as Array<{ user_id: string; last_read_at: string | null }>).filter(
    (p) => p.user_id !== input.auteurId,
  );

  const maintenant = new Date().toISOString();
  const { error } = await admin
    .schema('app')
    .from('direct_messages' as never)
    .insert({
      organization_id: input.organizationId,
      conversation_id: input.conversationId,
      author_user_id: input.auteurId,
      author_name: input.auteurNom,
      body: input.body,
    } as never);
  if (error) return { ok: false, error: "Le message n'a pas été envoyé." };
  await Promise.all([
    admin.schema('app').from('direct_conversations' as never).update({ last_message_at: maintenant } as never).eq('id', input.conversationId),
    marquerConversationLue(input.conversationId, input.auteurId),
  ]);

  if (autres.length > 0) {
    const { error: eNotif } = await admin
      .schema('app')
      .from('notifications')
      .insert(
        autres.map((p) => ({
          organization_id: input.organizationId,
          channel: 'in_app',
          template_code: 'discussion.direct',
          recipient_user_id: p.user_id,
          subject: `${input.auteurNom} vous a écrit`,
          payload: {
            conversation_id: input.conversationId,
            author_name: input.auteurNom,
            extrait: input.body.slice(0, 280),
            lien: `${input.cheminDe(p.user_id)}?direct=${input.conversationId}`,
          },
          status: 'sent',
          sent_at: maintenant,
        })) as never,
      );
    if (eNotif) console.error('[messages directs] cloche non notée', eNotif.message);
  }

  const aPrevenir = autres.filter((p) => prevenirParEmail(dernierAvant, p.last_read_at));
  if (aPrevenir.length > 0) {
    const { data: profils } = await admin
      .schema('app')
      .from('profiles')
      .select('user_id, email')
      .in('user_id', aPrevenir.map((p) => p.user_id));
    const app = (env.PUBLIC_APP_URL ?? '').replace(/\/$/, '');
    for (const p of (profils ?? []) as Array<{ user_id: string; email: string | null }>) {
      if (!p.email || !app) continue;
      const { subject, html } = messageDirectEmail({
        auteur: input.auteurNom,
        message: input.body,
        lien: `${app}${input.cheminDe(p.user_id)}?direct=${input.conversationId}`,
      });
      const r = await sendEmail({ to: p.email, subject, html, organizationId: input.organizationId, kind: 'message_direct' });
      if (!r.ok && r.reason !== 'no_api_key') console.error('[messages directs] e-mail non parti', r.reason);
    }
  }
  return { ok: true };
}

/** La messagerie de chacun : l'espace formateur pour qui n'est pas membre de l'équipe. */
export async function cheminsDesMessageries(organizationId: string): Promise<(userId: string) => string> {
  const { data } = await supabaseAdmin()
    .schema('app')
    .from('members')
    .select('user_id, role')
    .eq('organization_id', organizationId)
    .in('role', [...ROLES_EQUIPE] as never)
    .is('deleted_at', null);
  const equipe = new Set(((data ?? []) as Array<{ user_id: string }>).map((m) => m.user_id));
  return (userId) => (equipe.has(userId) ? '/messagerie' : '/mes-discussions');
}
