// ARCHETYPE: workflow
// Justification: le programme de la formation que le formateur anime — objectifs,
// contenu, méthodes, évaluation — pour préparer son cours. Sans aucun tarif.

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { BookOpenText, ListChecks } from 'lucide-react';
import { supabaseAdmin } from '@/shared/lib/supabase/admin';
import { requireMyTrainerSession } from '@/features/trainer-space/guard';
import { loadSession } from '@/features/sessions/load-session';
import { heure, jourLong } from '@/features/trainer-space/dates';
import { loadProgrammePourFormateur } from '@/features/formations/programme/load-for-trainer';
import { ProgrammeDocument } from '@/features/formations/programme/programme-document';
import { SeanceNav } from '../_components/seance-nav';
import { Imprimer } from './imprimer.client';

export const dynamic = 'force-dynamic';

export default async function SeanceProgrammePage({ params }: { params: { id: string } }) {
  const acces = await requireMyTrainerSession(params.id);
  if (!acces.ok) notFound();

  const loaded = await loadSession(supabaseAdmin(), params.id);
  if (!loaded) notFound();
  const { session, formation } = loaded;
  const programme = formation ? await loadProgrammePourFormateur(formation.id) : null;

  return (
    <div className="max-w-5xl w-full mx-auto px-6 py-8 space-y-6">
      <div className="print:hidden">
        <SeanceNav
          sessionId={params.id}
          quand={`${jourLong(session.starts_at)} · ${heure(session.starts_at)} – ${heure(session.ends_at)}`}
          titre={formation?.title ?? session.title ?? 'Séance'}
          sousTitre="Le programme de la formation : objectifs, contenu, méthodes et évaluation. Appuyez-vous dessus pour préparer votre cours."
          actif="programme"
        />
      </div>

      {programme ? (
        <>
          <div className="flex items-center justify-between gap-3 flex-wrap print:hidden">
            <Link
              href={`/seance/${params.id}/cours`}
              className="text-[13px] font-medium text-orange-600 dark:text-orange-400 inline-flex items-center gap-1.5 hover:underline"
            >
              <ListChecks className="w-3.5 h-3.5" /> Préparer mon cours à partir de ce programme
            </Link>
            <Imprimer />
          </div>
          <div className="rounded-xl overflow-hidden border border-zinc-200/70 dark:border-zinc-800 bg-white shadow-sm print:border-0 print:shadow-none">
            <ProgrammeDocument programme={programme} />
          </div>
        </>
      ) : (
        <div className="rounded-xl border border-dashed border-zinc-200 dark:border-zinc-800 px-4 py-12 text-center">
          <span className="mx-auto mb-3 w-12 h-12 rounded-xl grid place-items-center bg-purple-100 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300">
            <BookOpenText className="h-6 w-6" />
          </span>
          <p className="text-[13px] text-zinc-500 dark:text-zinc-400">
            Cette séance n&apos;est rattachée à aucune formation : il n&apos;y a pas de programme à consulter.
          </p>
        </div>
      )}
    </div>
  );
}
