// ARCHETYPE: workflow
// Justification: planning des sessions du dossier + sessions partagées multi-entreprises.

import { notFound } from 'next/navigation';
import { Video } from 'lucide-react';
import { supabaseServer } from '@/shared/lib/supabase/server';
import { SectionLabel } from '@/shared/ui/section-label';
import { unlinkDossierFromSession } from './actions';
import { SessionForm, GenerateMeetButton } from './_components/session-form';

export default async function SessionsPage({ params }: { params: { id: string } }) {
  const sb = supabaseServer();

  const { data: dossier } = await sb.schema('app').from('dossiers')
    .select('id, total_hours').eq('id', params.id).maybeSingle();
  if (!dossier) notFound();

  // Sessions où CE dossier est lié (primaire ou partagé). Prod-safe : si
  // session_dossiers n'est pas encore migrée, data=null → liste vide.
  const { data: links } = await sb.schema('app').from('session_dossiers')
    .select('session_id').eq('dossier_id', params.id);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sessionIds = ((links as any[]) ?? []).map((l) => l.session_id);

  const { data: sessions } = sessionIds.length
    ? await sb.schema('app').from('sessions')
        .select('id, title, modality, status, starts_at, ends_at, duration_hours, dossier_id, remote_url')
        .in('id', sessionIds).order('starts_at', { ascending: true })
    : { data: [] };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = (sessions as any[]) ?? [];
  const coveredHours = rows.reduce((sum, s) => sum + Number(s.duration_hours ?? 0), 0);
  const totalHours = Number((dossier as { total_hours?: number }).total_hours ?? 0);

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <SectionLabel>Sessions ({rows.length})</SectionLabel>
        <span className="text-[12px] text-zinc-500">Volume couvert : {coveredHours} h / {totalHours} h</span>
      </header>

      <SessionForm dossierId={params.id} />

      <ul className="border-y border-zinc-200/60 dark:border-zinc-800 divide-y divide-zinc-200/60 dark:divide-zinc-800">
        {rows.map((s) => {
          const isRemote = s.modality === 'distanciel' || s.modality === 'hybride';
          return (
            <li key={s.id} className="py-3 px-1 text-[13px] flex items-center justify-between gap-4">
              <div className="min-w-0">
                <div className="font-medium">{s.title ?? s.modality}</div>
                <div className="text-[11px] text-zinc-500">
                  {new Date(s.starts_at).toLocaleString('fr-FR')} · {Number(s.duration_hours)} h
                  {s.dossier_id !== params.id ? ' · partagée' : ''}
                </div>
                {s.remote_url && (
                  <a
                    href={s.remote_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-1 inline-flex items-center gap-1 text-[12px] text-violet-600 hover:text-violet-700 dark:text-violet-400 break-all"
                  >
                    <Video className="w-3 h-3 shrink-0" /> Rejoindre la visio
                  </a>
                )}
              </div>
              <div className="flex items-center gap-3 flex-shrink-0">
                {isRemote && !s.remote_url && <GenerateMeetButton sessionId={s.id} dossierId={params.id} />}
                {s.dossier_id !== params.id && (
                  <form action={async () => { 'use server'; await unlinkDossierFromSession(s.id, params.id, params.id); }}>
                    <button type="submit" className="text-[11px] text-zinc-500 hover:text-red-600 underline-offset-2 hover:underline">
                      Retirer ce dossier
                    </button>
                  </form>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      {rows.length === 0 && (
        <p className="text-[13px] text-zinc-500">
          Aucune session. Rattachez ce dossier à une session partagée existante, ou créez-en une.
        </p>
      )}
    </div>
  );
}
