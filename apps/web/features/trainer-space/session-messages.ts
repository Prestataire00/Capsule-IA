import 'server-only';
import { supabaseAdmin } from '@/shared/lib/supabase/admin';

/**
 * Fil de discussion d'une séance (0164) : formateur ↔ apprenants ↔ organisme.
 *
 * Un seul fil par séance, et non un fil par binôme : sur une formation, la
 * question d'un participant vaut réponse pour tous, et l'organisme doit voir ce
 * qui se dit sans qu'on le lui transfère.
 *
 * L'apprenant écrit depuis son espace à jeton, sans compte : son auteur est sa
 * fiche (`author_learner_id`), pas un utilisateur `auth`.
 */

export type AuthorKind = 'formateur' | 'organisme' | 'apprenant';

export type SessionMessage = {
  readonly id: string;
  readonly authorKind: AuthorKind;
  readonly authorName: string;
  readonly body: string;
  readonly createdAt: string;
};

export const MESSAGE_MAX_LENGTH = 5000;

type Row = {
  id: string;
  author_kind: AuthorKind;
  author_name: string;
  body: string;
  created_at: string;
};

export async function loadSessionMessages(sessionId: string, limit = 200): Promise<SessionMessage[]> {
  const { data, error } = await supabaseAdmin()
    .schema('app')
    .from('session_messages' as never)
    .select('id, author_kind, author_name, body, created_at')
    .eq('session_id', sessionId)
    .is('deleted_at', null)
    .order('created_at', { ascending: true })
    .limit(limit);
  if (error) {
    console.error('[messages] lecture impossible', sessionId, error.message);
    return [];
  }
  return ((data ?? []) as unknown as Row[]).map((r) => ({
    id: r.id,
    authorKind: r.author_kind,
    authorName: r.author_name,
    body: r.body,
    createdAt: r.created_at,
  }));
}

export async function postSessionMessage(input: {
  organizationId: string;
  sessionId: string;
  authorKind: AuthorKind;
  authorName: string;
  authorUserId?: string | null;
  authorLearnerId?: string | null;
  body: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const body = input.body.trim();
  if (body.length === 0) return { ok: false, error: 'message_vide' };
  if (body.length > MESSAGE_MAX_LENGTH) return { ok: false, error: 'message_trop_long' };

  const { error } = await supabaseAdmin()
    .schema('app')
    .from('session_messages' as never)
    .insert({
      organization_id: input.organizationId,
      session_id: input.sessionId,
      author_kind: input.authorKind,
      author_name: input.authorName,
      author_user_id: input.authorUserId ?? null,
      author_learner_id: input.authorLearnerId ?? null,
      body,
    } as never);
  return error ? { ok: false, error: error.message } : { ok: true };
}

/** Marque le fil comme lu — sert au badge « non lus » du formateur et de l'organisme. */
export async function markThreadRead(sessionId: string, userId: string): Promise<void> {
  const { error } = await supabaseAdmin()
    .schema('app')
    .from('session_message_reads' as never)
    .upsert(
      { session_id: sessionId, user_id: userId, last_read_at: new Date().toISOString() } as never,
      { onConflict: 'session_id,user_id' },
    );
  if (error) console.error('[messages] marque de lecture non enregistrée', sessionId, error.message);
}

/**
 * Nombre de messages non lus par séance, pour un utilisateur. Ses propres
 * messages ne comptent pas : on ne se notifie pas soi-même.
 */
export async function unreadCounts(
  sessionIds: readonly string[],
  userId: string,
  viewerKind: AuthorKind,
): Promise<Map<string, number>> {
  if (sessionIds.length === 0) return new Map();
  const admin = supabaseAdmin();

  const [{ data: msgs }, { data: reads }] = await Promise.all([
    admin
      .schema('app')
      .from('session_messages' as never)
      .select('session_id, author_kind, created_at')
      .in('session_id', [...sessionIds])
      .is('deleted_at', null),
    admin
      .schema('app')
      .from('session_message_reads' as never)
      .select('session_id, last_read_at')
      .in('session_id', [...sessionIds])
      .eq('user_id', userId),
  ]);

  const lu = new Map(
    ((reads ?? []) as unknown as Array<{ session_id: string; last_read_at: string }>).map((r) => [
      r.session_id,
      Date.parse(r.last_read_at),
    ]),
  );
  const counts = new Map<string, number>();
  for (const m of (msgs ?? []) as unknown as Array<{ session_id: string; author_kind: AuthorKind; created_at: string }>) {
    if (m.author_kind === viewerKind) continue;
    const seuil = lu.get(m.session_id) ?? 0;
    if (Date.parse(m.created_at) > seuil) counts.set(m.session_id, (counts.get(m.session_id) ?? 0) + 1);
  }
  return counts;
}
