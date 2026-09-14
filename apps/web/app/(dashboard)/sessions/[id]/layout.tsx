// ARCHETYPE: command (sous-shell d'une session)
// Justification: fiche session façon RFC — en-tête sobre (fil d'Ariane, statut, dates, étapes), puis onglets.

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChevronRight, Clock, MapPin, Users as UsersIcon, Video } from 'lucide-react';
import { supabaseServer } from '@/shared/lib/supabase/server';
import { StatusPill } from '@/shared/ui/status-pill';
import { loadSession } from '@/features/sessions/load-session';
import { canManageSection } from '@/shared/lib/auth/require-access';
import { SessionTabsNav } from './session-tabs-nav';
import { StatusSelect } from './status-select';

export const dynamic = 'force-dynamic';

const TZ = 'Europe/Paris';
const dayFmt = new Intl.DateTimeFormat('fr-FR', { timeZone: TZ, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const timeFmt = new Intl.DateTimeFormat('fr-FR', { timeZone: TZ, hour: '2-digit', minute: '2-digit' });
const hoursFmt = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 });

const STATUS: Record<string, { label: string; tone: 'info' | 'success' | 'neutral' | 'danger' }> = {
  planned: { label: 'Planifiée', tone: 'info' },
  in_progress: { label: 'En cours', tone: 'success' },
  done: { label: 'Terminée', tone: 'neutral' },
  cancelled: { label: 'Annulée', tone: 'danger' },
};
const ETAPES = [
  { key: 'planned', label: 'Planifiée' },
  { key: 'in_progress', label: 'En cours' },
  { key: 'done', label: 'Terminée' },
];
const modalityLabel: Record<string, string> = { presentiel: 'Présentiel', distanciel: 'Distanciel', hybride: 'Hybride' };

export default async function SessionLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { id: string };
}) {
  const sb = supabaseServer();
  const loaded = await loadSession(sb, params.id);
  if (!loaded) notFound();
  const { session, formation, learners, directLearners, client } = loaded;
  // Une séance libre porte ses participants sans dossier : ils comptent aussi.
  const participants = learners.length + directLearners.length;
  const gerer = await canManageSection('dossiers');

  const st = STATUS[session.status] ?? { label: session.status, tone: 'neutral' as const };
  const etape = ETAPES.findIndex((e) => e.key === session.status);
  const debut = new Date(session.starts_at);
  const fin = new Date(session.ends_at);

  return (
    <div className="min-h-[calc(100vh-3rem)]">
      <div className="max-w-6xl w-full mx-auto px-8 py-8">
        <nav aria-label="Fil d’Ariane" className="flex items-center gap-1.5 text-[13px] text-zinc-500 dark:text-zinc-400 mb-4 min-w-0">
          <Link href="/sessions" className="hover:text-zinc-900 dark:hover:text-zinc-100 transition">
            Sessions
          </Link>
          <ChevronRight className="w-3.5 h-3.5 flex-shrink-0" aria-hidden />
          {formation ? (
            <Link href={`/formations/${formation.id}`} className="truncate hover:text-zinc-900 dark:hover:text-zinc-100 transition">
              {formation.title}
            </Link>
          ) : (
            <span className="truncate">Session</span>
          )}
        </nav>

        <header className="mb-6">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="min-w-0">
              <div className="flex items-center gap-3 flex-wrap">
                <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100 first-letter:uppercase">
                  {session.title || formation?.title || dayFmt.format(debut)}
                </h1>
                {gerer ? <StatusSelect sessionId={session.id} status={session.status} /> : <StatusPill tone={st.tone}>{st.label}</StatusPill>}
              </div>
              <p className="text-[15px] text-zinc-600 dark:text-zinc-300 mt-1.5 tabular-nums first-letter:uppercase">
                {dayFmt.format(debut)} · {timeFmt.format(debut)} – {timeFmt.format(fin)}
              </p>
              <p className="text-[13px] text-zinc-500 dark:text-zinc-400 mt-1 flex items-center gap-x-4 gap-y-1 flex-wrap">
                <span className="inline-flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5" aria-hidden />
                  {modalityLabel[session.modality] ?? session.modality}
                  {session.location ? ` · ${session.location}` : ''}
                </span>
                <span className="inline-flex items-center gap-1.5 tabular-nums">
                  <Clock className="w-3.5 h-3.5" aria-hidden />
                  {hoursFmt.format(Number(session.duration_hours ?? 0))} h
                </span>
                <span className="inline-flex items-center gap-1.5 tabular-nums">
                  <UsersIcon className="w-3.5 h-3.5" aria-hidden />
                  {participants} participant{participants > 1 ? 's' : ''}
                </span>
                {client && <span className="inline-flex items-center gap-1.5">Client : {client.name}</span>}
              </p>
            </div>
            {session.remote_url && (
              <a
                href={session.remote_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-[13px] font-medium px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 shrink-0"
              >
                <Video className="w-4 h-4" /> Rejoindre la visio
              </a>
            )}
          </div>

          {session.status === 'cancelled' ? (
            <p className="mt-5 text-[13px] text-red-700 dark:text-red-300">Session annulée.</p>
          ) : (
            <ol className="mt-5 grid grid-cols-3 gap-2 max-w-xl" aria-label="Avancement de la session">
              {ETAPES.map((e, i) => (
                <li key={e.key} className="space-y-1.5" aria-current={i === etape ? 'step' : undefined}>
                  <span className={`block h-1.5 rounded-full ${i <= etape ? 'bg-orange-500' : 'bg-zinc-200 dark:bg-zinc-800'}`} />
                  <span className={`block text-center text-[12px] ${i === etape ? 'font-medium text-zinc-900 dark:text-zinc-100' : 'text-zinc-500 dark:text-zinc-400'}`}>
                    {e.label}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </header>

        <SessionTabsNav baseHref={`/sessions/${params.id}`} />

        <div className="mt-6">{children}</div>
      </div>
    </div>
  );
}
