// ARCHETYPE: command
// Justification: le formateur prépare sa séance — analyse des besoins de chacun de ses participants.

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { supabaseAdmin } from '@/shared/lib/supabase/admin';
import { requireMyTrainerSession } from '@/features/trainer-space/guard';
import { loadSession } from '@/features/sessions/load-session';
import { heure, jourLong } from '@/features/trainer-space/dates';
import { loadSessionNeeds } from '@/features/questionnaire/session-needs';
import { NeedsCard } from '@/features/questionnaire/ui/needs-card';

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
    <div className="max-w-2xl w-full mx-auto px-4 py-6 space-y-6">
      <Link href="/mes-sessions" className="text-[12px] text-zinc-500 inline-flex items-center gap-1.5 hover:text-zinc-800 dark:hover:text-zinc-200">
        <ArrowLeft className="w-3 h-3" /> Mes sessions
      </Link>
      <header>
        <p className="text-[11px] uppercase tracking-wider text-zinc-500 tabular-nums">
          {jourLong(session.starts_at)} · {heure(session.starts_at)} – {heure(session.ends_at)}
        </p>
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100 tracking-tight">
          {formation?.title ?? session.title ?? 'Séance'}
        </h1>
        <p className="text-[13px] text-zinc-500 dark:text-zinc-400 mt-1">
          Fiches besoin des participants — {recues} / {fiches.length} reçue{recues > 1 ? 's' : ''}
        </p>
      </header>

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
