// ARCHETYPE: command
// Justification: le formateur prépare sa séance — analyse des besoins de chacun de ses participants.

import { notFound } from 'next/navigation';
import { supabaseAdmin } from '@/shared/lib/supabase/admin';
import { requireMyTrainerSession } from '@/features/trainer-space/guard';
import { loadSession } from '@/features/sessions/load-session';
import { heure, jourLong } from '@/features/trainer-space/dates';
import { loadSessionNeeds } from '@/features/questionnaire/session-needs';
import { NeedsCard } from '@/features/questionnaire/ui/needs-card';
import { SeanceNav } from '../_components/seance-nav';

export const dynamic = 'force-dynamic';

export default async function SeanceFichesBesoin({ params }: { params: { id: string } }) {
  const acces = await requireMyTrainerSession(params.id);
  if (!acces.ok) notFound();

  // Service role après la garde : le formateur externe n'est pas membre de
  // l'organisme, mais cette séance est bien l'une des siennes.
  const admin = supabaseAdmin();
  const loaded = await loadSession(admin, params.id);
  if (!loaded) notFound();
  const { session, formation, learners, dossierIds } = loaded;

  const fiches = await loadSessionNeeds(admin, {
    organizationId: session.organization_id,
    participants: learners,
    dossierIds,
  });
  const recues = fiches.filter((f) => f.statut === 'recue').length;

  return (
    <div className="max-w-5xl w-full mx-auto px-6 py-8 space-y-6">
      <SeanceNav
        sessionId={params.id}
        quand={`${jourLong(session.starts_at)} · ${heure(session.starts_at)} – ${heure(session.ends_at)}`}
        titre={formation?.title ?? session.title ?? 'Séance'}
        sousTitre={`Fiches besoin des participants — ${recues} / ${fiches.length} reçue${recues > 1 ? 's' : ''}`}
        actif="fiches-besoin"
      />

      {fiches.length === 0 ? (
        <p className="text-[13px] text-zinc-400 text-center py-8">Aucun participant rattaché à cette séance.</p>
      ) : (
        <ul className="space-y-3">
          {fiches.map((f) => (
            <NeedsCard key={`${f.learnerId}-${f.dossierId}`} fiche={f} />
          ))}
        </ul>
      )}
    </div>
  );
}
