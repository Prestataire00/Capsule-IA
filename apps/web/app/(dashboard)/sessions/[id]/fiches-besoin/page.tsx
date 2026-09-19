// ARCHETYPE: command
// Justification: analyse des besoins de chaque participant de la session (questionnaire de positionnement).

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ClipboardList } from 'lucide-react';
import { supabaseServer } from '@/shared/lib/supabase/server';
import { EmptyState } from '@/shared/ui/empty-state';
import { loadSession } from '@/features/sessions/load-session';
import { loadSessionNeeds } from '@/features/questionnaire/session-needs';
import { NeedsCard } from '@/features/questionnaire/ui/needs-card';

export const dynamic = 'force-dynamic';

export default async function SessionFichesBesoin({ params }: { params: { id: string } }) {
  const sb = supabaseServer();
  const loaded = await loadSession(sb, params.id);
  if (!loaded) notFound();
  const { session, learners, dossierIds } = loaded;

  if (learners.length === 0) {
    return (
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-lg">
        <EmptyState icon={ClipboardList} title="Aucun participant" description="Rattachez des apprenants à la session pour suivre leur analyse des besoins." />
      </div>
    );
  }

  const fiches = await loadSessionNeeds(sb, {
    organizationId: session.organization_id,
    participants: learners,
    dossierIds,
  });
  const recues = fiches.filter((f) => f.statut === 'recue').length;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <p className="text-[13px] text-zinc-600 dark:text-zinc-400 max-w-2xl">
          Analyse des besoins de chaque participant (questionnaire de positionnement ou réponses saisies à l’inscription) :
          niveau, objectifs, attentes, contraintes et adaptations. Elle alimente l’indicateur Qualiopi 4. Le formateur de la
          séance y a accès depuis son espace.
        </p>
        <span className="text-[13px] text-zinc-700 dark:text-zinc-300 tabular-nums">
          {recues} / {fiches.length} fiche{fiches.length > 1 ? 's' : ''} reçue{recues > 1 ? 's' : ''}
        </span>
      </div>

      <ul className="space-y-3">
        {fiches.map((f) => (
          <NeedsCard
            key={`${f.learnerId}-${f.dossierId}`}
            fiche={f}
            entete={
              <Link href={`/dossiers/${f.dossierId}`} className="text-[13px] font-medium text-zinc-900 dark:text-zinc-100 hover:underline">
                {f.name}
              </Link>
            }
          />
        ))}
      </ul>
    </div>
  );
}
