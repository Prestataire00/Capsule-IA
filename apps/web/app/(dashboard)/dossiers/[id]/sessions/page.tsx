// ARCHETYPE: workflow
// Justification: planning des sessions du dossier + sessions partagées multi-entreprises.

import { notFound } from 'next/navigation';
import Link from 'next/link';
import { Video, ArrowUpRight, CalendarClock, Users } from 'lucide-react';
import { supabaseServer } from '@/shared/lib/supabase/server';
import { SectionLabel } from '@/shared/ui/section-label';
import { StatusPill } from '@/shared/ui/status-pill';
import { EmptyState } from '@/shared/ui/empty-state';
import { ACCENTS, AccentBar } from '@/shared/ui/kpi-card';
import { unlinkDossierFromSession } from './actions';
import { SessionForm, GenerateMeetButton } from './_components/session-form';
import { ImportPlanning } from './import-planning.client';

const STATUS: Record<string, { label: string; tone: 'info' | 'success' | 'neutral' | 'danger' }> = {
  planned: { label: 'Planifiée', tone: 'info' },
  in_progress: { label: 'En cours', tone: 'success' },
  done: { label: 'Terminée', tone: 'neutral' },
  cancelled: { label: 'Annulée', tone: 'danger' },
};
const MODALITY_LABEL: Record<string, string> = { presentiel: 'Présentiel', distanciel: 'Distanciel', hybride: 'Hybride' };

const ROW_GRID = 'grid grid-cols-[minmax(0,2fr)_150px_72px_minmax(0,1.4fr)_104px_minmax(0,1.1fr)] gap-4 px-5';

export default async function SessionsPage({ params }: { params: { id: string } }) {
  const sb = supabaseServer();

  const { data: dossier, error: erreurLecture } = await sb.schema('app').from('dossiers')
    .select('id, total_hours').eq('id', params.id).maybeSingle();
  // Une requête en échec n'est pas une ligne absente : sans cette
  // distinction, toute panne s'affiche en 404 (incident du 21/09/2026).
  if (erreurLecture) {
    console.error('[séances du dossier] lecture impossible', erreurLecture.code, erreurLecture.message);
    throw new Error(`Lecture impossible (séances du dossier) : ${erreurLecture.message}`);
  }
  if (!dossier) notFound();

  // Les groupes du dossier (0194) : une séance peut n'en viser qu'un.
  const { data: groupesRows } = await sb
    .schema('app')
    .from('dossier_groupes' as never)
    .select('id, nom')
    .eq('dossier_id', params.id)
    .order('ordre', { ascending: true });
  const groupes = (groupesRows ?? []) as unknown as Array<{ id: string; nom: string }>;

  // Une séance tient à son dossier par deux chemins, et les deux comptent :
  // la table de liaison `session_dossiers` (séance partagée entre plusieurs
  // dossiers) et la colonne `sessions.dossier_id` (séance propre au dossier,
  // ce que pose l'import d'une convention). N'en lire qu'un seul affichait
  // « Aucune session » sur des dossiers qui en avaient six.
  const [{ data: links }, { data: directes }] = await Promise.all([
    // Prod-safe : si session_dossiers n'est pas encore migrée, data=null.
    sb.schema('app').from('session_dossiers').select('session_id').eq('dossier_id', params.id),
    sb.schema('app').from('sessions').select('id').eq('dossier_id', params.id),
  ]);
  const sessionIds = [
    ...new Set([
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ...((links as any[]) ?? []).map((l) => l.session_id as string),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ...((directes as any[]) ?? []).map((s) => s.id as string),
    ]),
  ];

  const { data: sessions } = sessionIds.length
    ? await sb.schema('app').from('sessions')
        .select('id, title, modality, status, starts_at, ends_at, duration_hours, dossier_id, remote_url, groupe_id')
        .in('id', sessionIds).order('starts_at', { ascending: true })
    : { data: [] };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = (sessions as any[]) ?? [];
  // Quelle séance est pour quel groupe : sans cette ligne, la liste ne le
  // disait pas — et le titre, seul endroit où le groupe se lisait jusqu'ici,
  // n'est qu'un texte libre qu'on peut oublier de renseigner.
  const nomDuGroupe = new Map(groupes.map((g) => [g.id, g.nom]));
  const coveredHours = rows.reduce((sum, s) => sum + Number(s.duration_hours ?? 0), 0);
  const totalHours = Number((dossier as { total_hours?: number }).total_hours ?? 0);

  const coverage = totalHours > 0 ? Math.min(1, coveredHours / totalHours) : 0;

  return (
    <div className="space-y-5">
      <header className="flex items-end justify-between gap-4 flex-wrap">
        <div className="flex items-start gap-3">
          <span className={`w-8 h-8 rounded-lg grid place-items-center shrink-0 ${ACCENTS.blue.soft}`}>
            <CalendarClock className="w-4 h-4" />
          </span>
          <div>
            <div className="flex items-center gap-2 mb-1">
              <SectionLabel>Sessions</SectionLabel>
              <span className={`rounded-full px-2 py-0.5 text-[12px] font-bold tabular-nums ${ACCENTS.blue.soft}`}>{rows.length}</span>
            </div>
            <p className="text-[13px] text-zinc-500 dark:text-zinc-400 tabular-nums">
              {rows.length} session{rows.length > 1 ? 's' : ''} · volume couvert : <span className="font-bold text-sky-700 dark:text-sky-300">{coveredHours} h</span> / {totalHours} h
            </p>
            {totalHours > 0 && (
              <div className="mt-2 w-56" title={`${Math.round(coverage * 100)} % du volume couvert`}>
                <AccentBar value={coveredHours} max={totalHours} accent={coverage >= 1 ? 'emerald' : 'amber'} />
              </div>
            )}
          </div>
        </div>
      </header>

      <SessionForm dossierId={params.id} groupes={groupes} />

      {/* Le calendrier arrive souvent tout fait, en pièce jointe : le ressaisir
          séance par séance est long et se trompe. */}
      <ImportPlanning dossierId={params.id} />

      {rows.length > 0 && (
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200/70 dark:border-zinc-800 rounded-xl shadow-sm overflow-x-auto">
          <div className="min-w-[860px]">
            <div className={`${ROW_GRID} h-9 items-center text-[11px] font-bold uppercase tracking-[0.06em] text-zinc-500 dark:text-zinc-400 bg-zinc-50 dark:bg-zinc-950/40 border-b border-zinc-200/70 dark:border-zinc-800`}>
              <div>Session</div>
              <div>Dates</div>
              <div>Durée</div>
              <div>Modalité</div>
              <div>Statut</div>
              <div className="text-right">Actions</div>
            </div>
            <ul className="divide-y divide-zinc-100 dark:divide-zinc-800/80">
              {rows.map((s) => {
                const isRemote = s.modality === 'distanciel' || s.modality === 'hybride';
                const _start = new Date(s.starts_at);
                const _end = s.ends_at
                  ? new Date(s.ends_at)
                  : new Date(_start.getTime() + Number(s.duration_hours ?? 0) * 3600000);
                const _d = new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
                const _t = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' });
                const _sameDay = _start.toDateString() === _end.toDateString();
                const st = STATUS[s.status] ?? { label: s.status, tone: 'neutral' as const };
                const shared = s.dossier_id !== params.id;
                return (
                  <li key={s.id} className={`${ROW_GRID} py-3.5 items-center hover:bg-zinc-50/80 dark:hover:bg-zinc-800/30 transition-colors`}>
                    <div className="min-w-0">
                      <Link href={`/sessions/${s.id}`} className="block truncate text-[15px] font-semibold text-[color:var(--sess)] hover:underline">
                        {s.title ?? s.modality}
                      </Link>
                      {shared && <p className="text-[12px] text-zinc-500 dark:text-zinc-400 mt-0.5">Session partagée</p>}
                    </div>

                    <div className="text-[13px] tabular-nums leading-tight">
                      <p className="font-bold text-zinc-900 dark:text-zinc-100">{_d.format(_start)}</p>
                      <p className="text-zinc-500 dark:text-zinc-400 mt-1">
                        {_sameDay
                          ? `${_t.format(_start)} \u2192 ${_t.format(_end)}`
                          : `${_t.format(_start)} \u2192 ${_d.format(_end)} ${_t.format(_end)}`}
                      </p>
                    </div>

                    <div className="text-[15px] font-bold text-sky-700 dark:text-sky-300 tabular-nums">{Number(s.duration_hours)} h</div>

                    <div className="min-w-0 flex items-center gap-1.5 flex-wrap">
                      {s.groupe_id && (
                        <span
                          title="Seuls les stagiaires de ce groupe sont attendus"
                          className={`inline-flex items-center gap-1.5 h-6 px-2 rounded-full text-[12px] font-semibold ${ACCENTS.rose.soft}`}
                        >
                          <Users className="w-3.5 h-3.5" />
                          {nomDuGroupe.get(s.groupe_id) ?? 'Groupe'}
                        </span>
                      )}
                      <span className={`inline-flex items-center gap-1.5 h-6 px-2 rounded-full text-[12px] font-semibold ${ACCENTS.purple.soft}`}>
                        {isRemote && <Video className="w-3.5 h-3.5" />}
                        {MODALITY_LABEL[s.modality] ?? s.modality}
                      </span>
                      {s.remote_url && (
                        <a
                          href={s.remote_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="h-6 px-2 rounded-md text-[11px] font-bold inline-flex items-center gap-1 bg-orange-50 text-orange-700 hover:bg-orange-100 dark:bg-orange-950/50 dark:text-orange-300 transition"
                        >
                          Rejoindre la visio <ArrowUpRight className="w-3 h-3" />
                        </a>
                      )}
                    </div>

                    <div>
                      <StatusPill tone={st.tone}>{st.label}</StatusPill>
                    </div>

                    <div className="flex items-center justify-end gap-3">
                      {isRemote && !s.remote_url && <GenerateMeetButton sessionId={s.id} dossierId={params.id} />}
                      {shared && (
                        <form action={async () => { 'use server'; await unlinkDossierFromSession(s.id, params.id, params.id); }}>
                          <button type="submit" className="text-[12px] font-semibold text-zinc-500 dark:text-zinc-400 hover:text-red-600 dark:hover:text-red-400 underline-offset-2 hover:underline">
                            Retirer ce dossier
                          </button>
                        </form>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      )}

      {rows.length === 0 && (
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200/70 dark:border-zinc-800 rounded-xl">
          <EmptyState
            icon={CalendarClock}
            title="Aucune session."
            description="Rattachez ce dossier à une session partagée existante, ou créez-en une."
          />
        </div>
      )}
    </div>
  );
}
