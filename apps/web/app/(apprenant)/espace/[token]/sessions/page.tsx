// ARCHETYPE: command
import { notFound } from 'next/navigation';
import { Video, Play, CheckCircle2, CircleDashed, FileWarning, KeyRound, QrCode } from 'lucide-react';
import { verifyApprenantToken } from '@/shared/lib/apprenant-token';
import { supabaseAdmin } from '@/shared/lib/supabase/admin';
import { JustificationUpload } from '@/features/attendance/justification-upload';
import { DECISION_LABELS, MAX_JUSTIFICATIONS_PER_SHEET } from '@/features/attendance/justification-rules';
import { resolveApprenantContext, formatSessionDate, formatSessionTime } from '../_lib';
import { loadSessionSignatureQRs, HALF_DAY_LABEL } from './attendance-qr';
import { loadAbsences } from './absences';

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
  const [ctx, replays, sigQrs, absences] = await Promise.all([
    resolveApprenantContext(params.token),
    resolvePublishedReplays(params.token),
    loadSessionSignatureQRs(params.token),
    loadAbsences(params.token),
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

      {absences.length > 0 && (
        <section className="mb-6 bg-white dark:bg-zinc-900 border border-amber-200/70 dark:border-amber-900/40 rounded-xl shadow-sm p-5 space-y-4">
          <div>
            <h2 className="text-[15px] font-semibold text-zinc-900 dark:text-zinc-100 inline-flex items-center gap-2">
              <FileWarning className="w-4 h-4 text-amber-600" aria-hidden />
              Absences
            </h2>
            <p className="text-[12px] text-zinc-500 dark:text-zinc-400 mt-0.5">
              Envoyez un justificatif (arrêt de travail, convocation…) : l’organisme l’examine et peut excuser l’absence.
            </p>
          </div>
          <ul className="space-y-4">
            {absences.map((a) => {
              const accepte = a.excused || a.justifications.some((j) => j.decision === 'acceptee');
              return (
                <li key={a.sheetId} className="space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-[13px] font-medium text-zinc-900 dark:text-zinc-100 capitalize">
                      {a.startsAt ? formatSessionDate(a.startsAt) : 'Séance'} · {HALF_DAY_LABEL[a.halfDay] ?? 'Journée'}
                    </p>
                    <span
                      className={`text-[11px] px-2 py-0.5 rounded-full ${
                        accepte
                          ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
                          : 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300'
                      }`}
                    >
                      {accepte ? 'Absence excusée' : 'Absence non justifiée'}
                    </span>
                  </div>
                  {a.justifications.length > 0 && (
                    <ul className="text-[12px] text-zinc-600 dark:text-zinc-300 space-y-0.5">
                      {a.justifications.map((j) => (
                        <li key={j.id}>
                          {j.fileName} — {DECISION_LABELS[j.decision] ?? j.decision}
                        </li>
                      ))}
                    </ul>
                  )}
                  {!accepte && a.justifications.length < MAX_JUSTIFICATIONS_PER_SHEET && (
                    <JustificationUpload endpoint={`/api/espace/${params.token}/justificatif`} fields={{ sheetId: a.sheetId }} />
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}

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
              const qrs = sigQrs.get(s.id) ?? [];

              return (
                <li key={s.id} className="py-3">
                  <div className="flex items-center justify-between gap-3">
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
                  </div>
                  {qrs.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-3">
                      {qrs.map((q) => (
                        <a
                          key={q.sheetId}
                          href={q.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex flex-col items-center gap-1 rounded-lg border border-zinc-200/70 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-2.5 hover:border-violet-300 dark:hover:border-violet-700 transition"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={q.qrDataUrl}
                            alt={`QR émargement ${HALF_DAY_LABEL[q.halfDay] ?? ''}`}
                            width={104}
                            height={104}
                            className="rounded"
                          />
                          <span className="text-[11px] font-medium text-zinc-700 dark:text-zinc-300">
                            {HALF_DAY_LABEL[q.halfDay] ?? 'Émargement'}
                          </span>
                          {q.alreadySigned ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
                              <CheckCircle2 className="w-3 h-3" /> Signé
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[10px] text-violet-600 dark:text-violet-400">
                              <QrCode className="w-3 h-3" /> Scanner pour signer
                            </span>
                          )}
                        </a>
                      ))}
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
