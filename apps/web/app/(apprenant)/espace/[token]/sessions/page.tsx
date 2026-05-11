// ARCHETYPE: command
import { notFound } from 'next/navigation';
import { Video, Play, CheckCircle2, CircleDashed } from 'lucide-react';
import { resolveApprenantContext, formatSessionDate, formatSessionTime } from '../_lib';

export const dynamic = 'force-dynamic';

export default async function EspaceSessionsPage({ params }: { params: { token: string } }) {
  const ctx = await resolveApprenantContext(params.token);
  if (!ctx) return notFound();

  return (
    <div className="max-w-3xl mx-auto px-8 py-8">
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
                  {isDone ? (
                    <a
                      href="#"
                      className="inline-flex items-center gap-1 text-[12px] text-violet-600 dark:text-violet-400 hover:text-violet-700 font-medium px-2.5 py-1 rounded-md bg-violet-50 dark:bg-violet-950/40 hover:bg-violet-100 dark:hover:bg-violet-950/60 transition flex-shrink-0"
                    >
                      <Play className="w-3 h-3" />
                      Replay
                    </a>
                  ) : isLive ? (
                    <span className="text-[11px] font-medium text-violet-600 dark:text-violet-400">En cours</span>
                  ) : (
                    <span className="text-[11px] text-zinc-400">à venir</span>
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
