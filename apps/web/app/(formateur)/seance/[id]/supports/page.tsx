// ARCHETYPE: workflow
// Justification: le formateur monte son espace e-learning — dépôt, publication, retrait.

import { notFound } from 'next/navigation';
import { supabaseAdmin } from '@/shared/lib/supabase/admin';
import { requireMyTrainerSession } from '@/features/trainer-space/guard';
import { loadSession } from '@/features/sessions/load-session';
import { heure, jourLong } from '@/features/trainer-space/dates';
import { loadSessionResources } from '@/features/trainer-space/session-resources';
import { SeanceNav } from '../_components/seance-nav';
import { SupportsManager } from './supports-manager.client';
import { loadAnnotations } from '@/features/pedagogie/annotations-store';
import { RetoursRelecture } from '../../../_cours/retours-relecture';

export const dynamic = 'force-dynamic';

export default async function SeanceSupportsPage({ params }: { params: { id: string } }) {
  const acces = await requireMyTrainerSession(params.id);
  if (!acces.ok) notFound();

  const admin = supabaseAdmin();
  const loaded = await loadSession(admin, params.id);
  if (!loaded) notFound();
  const { session, formation } = loaded;

  const supports = await loadSessionResources(params.id);
  const publies = supports.filter((s) => s.isPublished).length;
  const annotations = await loadAnnotations('support', supports.map((s) => s.id));
  const annotes = supports.filter((s) => (annotations.get(s.id) ?? []).length > 0);

  return (
    <div className="max-w-5xl w-full mx-auto px-6 py-8 space-y-6">
      <SeanceNav
        sessionId={params.id}
        quand={`${jourLong(session.starts_at)} · ${heure(session.starts_at)} – ${heure(session.ends_at)}`}
        titre={formation?.title ?? session.title ?? 'Séance'}
        sousTitre={
          supports.length === 0
            ? 'Vos supports apparaissent dans l’espace des participants dès leur publication.'
            : `${publies} support${publies > 1 ? 's' : ''} visible${publies > 1 ? 's' : ''} par les participants, sur ${supports.length}.`
        }
        actif="supports"
      />
      <SupportsManager sessionId={params.id} supports={supports} />
      {annotes.length > 0 && (
        <ul className="space-y-3">
          {annotes.map((s) => (
            <li key={s.id} className="rounded-xl border border-zinc-200/70 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 shadow-sm">
              <p className="text-[13px] font-medium text-zinc-900 dark:text-zinc-100">{s.title}</p>
              <RetoursRelecture annotations={annotations.get(s.id) ?? []} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
