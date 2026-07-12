// ARCHETYPE: command
import { notFound } from 'next/navigation';
import { Video, Play, CheckCircle2, CircleDashed, KeyRound } from 'lucide-react';
import { verifyApprenantToken } from '@/shared/lib/apprenant-token';
import { supabaseAdmin } from '@/shared/lib/supabase/admin';
import { resolveApprenantContext, formatSessionDate, formatSessionTime } from '../_lib';

export const dynamic = 'force-dynamic';

type ReplayInfo = {
  sessionId: string;
  passcode: string | null;
};

/** Charge les session_ids ayant un replay publié pour le dossier de l'apprenant. */
async function resolvePublishedReplays(token: string): Promise<Map<string, ReplayInfo>> {
  const verified = await verifyApprenantToken(token);
  if (!verified.ok) return new Map();

  const admin = supabaseAdmin();
  const { dossierId } = verified.value;

  // Récupère les session_id liés au dossier (direct + junction)
  const [byDirect, byJunction] = await Promise.all([
    admin
      .schema('app')
      .from('sessions')
      .select('id')
      .eq('dossier_id', dossierId),
    admin
      .schema('app')
      .from('session_dossiers' as never)
      .select('session_id')
      .eq('dossier_id', dossierId),
  ]);

  const sessionIds = new Set<string>();
  for (const row of (byDirect.data ?? []) as { id: string }[]) {
    sessionIds.add(row.id);
  }
  for (const row of (byJunction.data ?? []) as { session_id: string }[]) {
    sessionIds.add(row.session_id);
  }

  if (sessionIds.size === 0) return new Map();

  // Un seul enregistrement publié par session (le plus récent)
  const { data: recordings } = await admin
    .schema('app')
    .from('session_recordings' as never)
    .select('session_id, passcode')
    .in('session_id', [...sessionIds])
    .eq('is_published', true)
    .is('deleted_at', null)
    .order('recorded_at', { ascending: false });

  const map = new Map<string, ReplayInfo>();
  for (const r of (recordings ?? []) as { session_id: string; passcode: string | null }[]) {
    // .in() + order : on prend le premier occurrence par session_id (le plus récent)
    if (!map.has(r.session_id)) {
      map.set(r.session_id, { sessionId: r.session_id, passcode: r.passcode });
    }
  }
  return map;
}

export default async function EspaceSessionsPage({ params }: { params: { token: string } }) {
  const [ctx, replays] = await Promise.all([
    resolveApprenantContext(params.token),
    resolvePublishedReplays(params.token),
  ]);
  if (!ctx) return notFound();

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
      <header className="mb-6 flex items-center gap-3">
        <span className="w-11 h-11 rounded-xl bg-gradient-to-br from-violet-100 to-violet-50 dark:from-violet-950/60 dark:to-violet-950/30 text-violet-700 dark:text-violet-300 flex items-center justify-center shadow-sm">
          <Video className="w-5 h-5" />
        </span>
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100 tracking-tight">Sessions & replays</h1>
          <p className="text-[13px] text-zinc-500 dark:text-zinc-400 mt-0.5">
            {ctx.sessions.length} séance{ctx.sessions.length > 1 ? 's' : ''} planifiée{ctx.sessions.length > 1 ? 's' : ''} sur votre parcours.
          </p>
        </div>
      </header>

      <section className="bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-xl shadow-sm p-5">
        {ctx.sessions.length === 0 ? (
          <p className="text-[13px] text-zinc-500 dark:text-zinc-400 text-center py-8">
            Aucune séance planifiée pour l'instant.
          </p>
        ) : (
          <ul className="divide-y divide-zinc-100 dark:divide-zinc-800 -my-3">
            {ctx.sessions.map((s) => {
              const isDone = s.status === 'done';
              const isLive = s.status === 'in_progress';
              const replay = replays.get(s.id);
              const replayUrl = `/api/espace/${params.token}/replay/${s.id}`;
              const canJoin = !isDone && !!s.remoteUrl;

              return (
                <li key={s.id} className="py-3 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <span
                      className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
                        isDone
                          ? 'bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300'
                          : isLive
                          ? 'bg-violet-100 dark:bg-violet-950/40 text-violet-700 dark:text-violet-300 animate-pulse'
                          : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400'
                      }`}
                    >
                      {isDone ? <CheckCircle2 className="w-4 h-4" /> : isLive ? <Play className="w-4 h-4" /> : <CircleDashed className="w-4 h-4" />}
                    </span>
                    <div className="min-w-0">
                      <p className="text-[13px] font-medium text-zinc-900 dark:text-zinc-100 capitalize truncate">
                        {formatSessionDate(s.startsAt)}
                      </p>
                      <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">
                        {formatSessionTime(s.startsAt)} – {formatSessionTime(s.endsAt)}
                        {s.location && ` · ${s.location}`}
                      </p>
                    </div>
                  </div>
                  {replay ? (
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <a
                        href={replayUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-[12px] text-violet-600 dark:text-violet-400 hover:text-violet-700 font-medium px-2.5 py-1 rounded-md bg-violet-50 dark:bg-violet-950/40 hover:bg-violet-100 dark:hover:bg-violet-950/60 transition"
                      >
                        <Play className="w-3 h-3" />
                        Replay
                      </a>
                      {replay.passcode && (
                        <span
                          title={`Code d'accès : ${replay.passcode}`}
                          className="inline-flex items-center gap-1 text-[11px] text-zinc-500 dark:text-zinc-400 px-2 py-1 rounded-md bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700"
                        >
                          <KeyRound className="w-3 h-3" />
                          {replay.passcode}
                        </span>
                      )}
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {canJoin && (
                        <a
                          href={s.remoteUrl as string}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={`inline-flex items-center gap-1 text-[12px] font-medium px-2.5 py-1 rounded-md transition ${
                            isLive
                              ? 'text-white bg-violet-600 hover:bg-violet-700 shadow-sm'
                              : 'text-violet-600 dark:text-violet-400 bg-violet-50 dark:bg-violet-950/40 hover:bg-violet-100 dark:hover:bg-violet-950/60'
                          }`}
                        >
                          <Video className="w-3 h-3" />
                          Rejoindre la visio
                        </a>
                      )}
                      {isLive ? (
                        <span className="text-[11px] font-medium text-violet-600 dark:text-violet-400">En cours</span>
                      ) : (
                        <span className="text-[11px] text-zinc-400">à venir</span>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
