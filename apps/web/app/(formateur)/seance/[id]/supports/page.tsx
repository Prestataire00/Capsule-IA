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
    </div>
  );
}
