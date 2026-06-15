// ARCHETYPE: workflow
// Justification: saisie manuelle d'une réponse de questionnaire par un admin
// (apprenant ayant répondu sur papier ou par téléphone).

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, ClipboardPen, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { supabaseServer } from '@/shared/lib/supabase/server';
import { QuestionRenderer } from '@/features/questionnaire/question-renderer';
import type { QuestionnaireSchema } from '@/features/questionnaire/schema';
import { saveManualResponse } from './actions';

export const dynamic = 'force-dynamic';

export default async function ManualEntryPage({
  params,
  searchParams,
}: {
  params: { id: string; assignmentId: string };
  searchParams: { error?: string };
}) {
  const sb = supabaseServer();
  const { data } = await sb
    .schema('app')
    .from('questionnaire_assignments')
    .select('id, recipient_name, status, template:questionnaire_templates(title, schema)')
    .eq('id', params.assignmentId)
    .eq('dossier_id', params.id)
    .maybeSingle();

  const a = data as {
    recipient_name: string | null;
    status: string;
    template: { title: string; schema: QuestionnaireSchema } | null;
  } | null;
  if (!a || !a.template) return notFound();

  const back = `/dossiers/${params.id}/questionnaires`;
  const alreadyDone = a.status === 'completed';

  return (
    <div className="max-w-2xl mx-auto py-2">
      <Link href={back} className="text-[13px] text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 inline-flex items-center gap-1.5 transition mb-5">
        <ArrowLeft className="w-3.5 h-3.5" /> Questionnaires du dossier
      </Link>

      <header className="mb-5 flex items-center gap-3">
        <span className="w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 flex items-center justify-center shadow-sm">
          <ClipboardPen className="w-5 h-5" />
        </span>
        <div>
          <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100 tracking-tight">{a.template.title}</h1>
          <p className="text-[12px] text-zinc-500 dark:text-zinc-400 mt-0.5">
            Saisie manuelle{a.recipient_name ? ` — ${a.recipient_name}` : ''} (réponse papier / téléphone).
          </p>
        </div>
      </header>

      {alreadyDone ? (
        <div className="bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200/60 dark:border-emerald-900/40 text-emerald-800 dark:text-emerald-200 rounded-lg px-4 py-3 text-[13px] inline-flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" /> Ce questionnaire a déjà une réponse enregistrée.
        </div>
      ) : (
        <>
          {searchParams.error && (
            <div className="bg-rose-50 dark:bg-rose-950/40 border border-rose-200/60 dark:border-rose-900/40 text-rose-800 dark:text-rose-200 rounded-lg px-4 py-3 text-[13px] mb-5 inline-flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              {searchParams.error === 'incomplete'
                ? 'Réponses obligatoires manquantes.'
                : searchParams.error === 'forbidden'
                  ? "Vous n'avez pas les droits."
                  : 'Une erreur est survenue.'}
            </div>
          )}
          <form action={saveManualResponse} className="bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-xl shadow-sm divide-y divide-zinc-200/60 dark:divide-zinc-800">
            <input type="hidden" name="assignmentId" value={params.assignmentId} />
            <input type="hidden" name="dossierId" value={params.id} />
            <QuestionRenderer questions={a.template.schema.questions} />
            <div className="px-6 py-4 bg-zinc-50/40 dark:bg-zinc-950/40 flex items-center justify-end rounded-b-xl">
              <button type="submit" className="bg-orange-500 hover:bg-orange-600 text-white text-[13px] font-medium px-4 py-2 rounded-lg transition shadow-sm inline-flex items-center gap-2">
                Enregistrer la réponse
              </button>
            </div>
          </form>
        </>
      )}
    </div>
  );
}
