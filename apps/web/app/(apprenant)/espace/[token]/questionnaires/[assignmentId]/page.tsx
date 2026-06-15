// ARCHETYPE: workflow
// Justification: l'apprenant remplit un questionnaire assigné (analyse des besoins, satisfaction)
// directement depuis l'espace — persistance réelle dans questionnaire_responses.

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, ClipboardList, Send, Sparkles, ShieldCheck, AlertTriangle } from 'lucide-react';
import { QuestionRenderer } from '@/features/questionnaire/question-renderer';
import { loadApprenantQuestionnaire } from '../../questionnaires';
import { submitApprenantQuestionnaire } from './actions';

export const dynamic = 'force-dynamic';

export default async function FillQuestionnairePage({
  params,
  searchParams,
}: {
  params: { token: string; assignmentId: string };
  searchParams: { error?: string };
}) {
  const loaded = await loadApprenantQuestionnaire(params.token, params.assignmentId);
  if (loaded.state === 'invalid' || loaded.state === 'forbidden') return notFound();

  const back = `/espace/${params.token}/questionnaires`;

  if (loaded.state === 'answered') {
    return (
      <div className="max-w-3xl mx-auto px-8 py-8">
        <Link href={back} className="text-[13px] text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 inline-flex items-center gap-1.5 transition mb-6">
          <ArrowLeft className="w-3.5 h-3.5" /> Mes questionnaires
        </Link>
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-xl shadow-sm p-10 text-center">
          <Sparkles className="w-10 h-10 text-violet-500 mx-auto mb-4" />
          <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100 mb-2">Déjà répondu, merci 🙏</h1>
          <p className="text-[13px] text-zinc-500 dark:text-zinc-400">« {loaded.title} » a bien été enregistré.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-8 py-8">
      <Link href={back} className="text-[13px] text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 inline-flex items-center gap-1.5 transition mb-6">
        <ArrowLeft className="w-3.5 h-3.5" /> Mes questionnaires
      </Link>

      <header className="mb-6 flex items-center gap-3">
        <span className="w-11 h-11 rounded-xl bg-gradient-to-br from-violet-100 to-violet-50 dark:from-violet-950/60 dark:to-violet-950/30 text-violet-700 dark:text-violet-300 flex items-center justify-center shadow-sm">
          <ClipboardList className="w-5 h-5" />
        </span>
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100 tracking-tight">{loaded.title}</h1>
          <p className="text-[13px] text-zinc-500 dark:text-zinc-400 mt-0.5">Quelques minutes · vos réponses sont confidentielles.</p>
        </div>
      </header>

      {searchParams.error && (
        <div className="bg-rose-50 dark:bg-rose-950/40 border border-rose-200/60 dark:border-rose-900/40 text-rose-800 dark:text-rose-200 rounded-lg px-4 py-3 text-[13px] mb-6 inline-flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          {searchParams.error === 'incomplete'
            ? 'Certaines réponses obligatoires sont manquantes.'
            : 'Une erreur est survenue, merci de réessayer.'}
        </div>
      )}

      {loaded.schema.questions.length === 0 ? (
        <p className="text-[13px] text-zinc-500 dark:text-zinc-400">Ce questionnaire ne contient aucune question.</p>
      ) : (
        <form action={submitApprenantQuestionnaire} className="bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-xl shadow-sm divide-y divide-zinc-200/60 dark:divide-zinc-800">
          <input type="hidden" name="token" value={params.token} />
          <input type="hidden" name="assignmentId" value={params.assignmentId} />

          <QuestionRenderer questions={loaded.schema.questions} />

          <div className="px-6 py-4 bg-zinc-50/40 dark:bg-zinc-950/40 flex items-center justify-between gap-3 rounded-b-xl">
            <p className="text-[11px] text-zinc-500 dark:text-zinc-400 inline-flex items-center gap-1.5">
              <ShieldCheck className="w-3 h-3" /> Données traitées RGPD
            </p>
            <button type="submit" className="bg-violet-600 hover:bg-violet-700 text-white text-[13px] font-medium px-4 py-2 rounded-lg transition shadow-sm inline-flex items-center gap-2">
              <Send className="w-3.5 h-3.5" /> Envoyer mes réponses
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
