import 'server-only';
import { supabaseAdmin } from '@/shared/lib/supabase/admin';
import { lienDeReplay, sourceDuReplay, type SourceReplay } from './replays';

/**
 * Lecture et écriture des replays d'une séance, en service role : les
 * appelants ont vérifié avant que la séance est la leur (équipe de
 * l'organisme, ou formateur de la séance).
 */

export type Replay = { readonly id: string; readonly titre: string | null; readonly url: string; readonly source: SourceReplay; readonly ajouteLe: string };

export async function replaysDesSeances(sessionIds: readonly string[]): Promise<Map<string, Replay[]>> {
  const out = new Map<string, Replay[]>();
  if (sessionIds.length === 0) return out;
  const { data, error } = await supabaseAdmin()
    .schema('app')
    .from('session_recordings' as never)
    .select('id, session_id, title, play_url, source, created_at' as never)
    .in('session_id' as never, [...sessionIds] as never)
    .eq('is_published' as never, true as never)
    .is('deleted_at', null)
    .order('created_at', { ascending: true });
  // Les replays complètent la page, ils ne doivent pas l'empêcher de s'afficher.
  if (error) {
    console.error('[replays] lecture impossible', error.message);
    return out;
  }
  for (const r of (data ?? []) as unknown as Array<{ id: string; session_id: string; title: string | null; play_url: string; source: SourceReplay; created_at: string }>) {
    // Un lien qui n'est pas une adresse web (ancienne saisie) ne s'affiche pas.
    if (!lienDeReplay(r.play_url)) continue;
    out.set(r.session_id, [...(out.get(r.session_id) ?? []), { id: r.id, titre: r.title, url: r.play_url, source: r.source, ajouteLe: r.created_at }]);
  }
  return out;
}

export type ResultatReplay = { ok: true } | { ok: false; error: string };

export async function enregistrerReplay(args: {
  organizationId: string;
  sessionId: string;
  url: string;
  titre: string | null;
  userId: string | null;
}): Promise<ResultatReplay> {
  const lien = lienDeReplay(args.url);
  if (!lien) return { ok: false, error: 'Collez le lien de partage du replay (il commence par https://).' };
  const { error } = await supabaseAdmin()
    .schema('app')
    .from('session_recordings' as never)
    .insert({
      organization_id: args.organizationId,
      session_id: args.sessionId,
      source: sourceDuReplay(lien),
      play_url: lien.href,
      title: args.titre?.trim() || null,
      is_published: true,
      created_by: args.userId,
    } as never);
  if (error) {
    console.error('[replays] ajout impossible', args.sessionId, error.message);
    return { ok: false, error: 'Le replay n’a pas pu être ajouté.' };
  }
  return { ok: true };
}

export async function retirerReplay(args: { organizationId: string; sessionId: string; replayId: string }): Promise<ResultatReplay> {
  const { error } = await supabaseAdmin()
    .schema('app')
    .from('session_recordings' as never)
    .update({ deleted_at: new Date().toISOString() } as never)
    .eq('id', args.replayId)
    .eq('session_id', args.sessionId)
    .eq('organization_id', args.organizationId);
  if (error) return { ok: false, error: 'Le replay n’a pas pu être retiré.' };
  return { ok: true };
}
