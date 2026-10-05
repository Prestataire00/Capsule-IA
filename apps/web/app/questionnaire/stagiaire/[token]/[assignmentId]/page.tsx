// ARCHETYPE: workflow (mobile)
// Justification: le stagiaire répond à un questionnaire dont le lien lui a été
// transmis par son entreprise — une page seule, sans espace à parcourir.

import { notFound } from 'next/navigation';
import { AlertTriangle, CheckCircle2, ClipboardList, Send, ShieldCheck } from 'lucide-react';
import { QuestionRenderer } from '@/features/questionnaire/question-renderer';
import { loadApprenantQuestionnaire } from '@/app/(apprenant)/espace/[token]/questionnaires';
import { submitApprenantQuestionnaire } from '@/app/(apprenant)/espace/[token]/questionnaires/[assignmentId]/actions';

export const dynamic = 'force-dynamic';

function Merci({ titre }: { titre: string }) {
  return (
    <main className="min-h-screen bg-zinc-50 dark:bg-zinc-950 grid place-items-center px-4">
      <div className="max-w-md text-center space-y-2">
        <CheckCircle2 className="w-10 h-10 text-emerald-600 mx-auto" />
        <h1 className="text-[22px] font-semibold text-zinc-900 dark:text-zinc-100">Merci, c’est enregistré</h1>
        <p className="text-[13px] text-zinc-500 dark:text-zinc-400">Vos réponses à « {titre} » ont bien été reçues.</p>
      </div>
    </main>
  );
}

export default async function QuestionnaireStagiairePage({
  params,
  searchParams,
}: {
  params: { token: string; assignmentId: string };
  searchParams: { error?: string; merci?: string };
}) {
  const loaded = await loadApprenantQuestionnaire(params.token, params.assignmentId);
  if (loaded.state === 'invalid' || loaded.state === 'forbidden') notFound();
  if (loaded.state === 'answered') return <Merci titre={loaded.title} />;

  return (
    <main className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        <header className="mb-6 rounded-2xl border border-orange-100 dark:border-orange-900/40 bg-gradient-to-br from-orange-50 to-white dark:from-orange-950/40 dark:to-zinc-900 px-5 py-4 flex items-center gap-3">
          <span className="w-10 h-10 rounded-xl grid place-items-center text-white shrink-0 bg-purple-500">
            <ClipboardList className="w-5 h-5" />
          </span>
          <div>
            <h1 className="text-[22px] leading-tight font-semibold text-zinc-900 dark:text-zinc-100">{loaded.title}</h1>
            <p className="text-[13px] text-zinc-500 dark:text-zinc-400 mt-0.5">Quelques minutes · vos réponses sont confidentielles.</p>
          </div>
        </header>

        {searchParams.error && (
          <div className="bg-rose-50 dark:bg-rose-950/40 border border-rose-200/60 dark:border-rose-900/40 text-rose-800 dark:text-rose-200 rounded-xl px-4 py-3 text-[13px] mb-6 inline-flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            {searchParams.error === 'incomplete' ? 'Certaines réponses obligatoires sont manquantes.' : 'Une erreur est survenue, merci de réessayer.'}
          </div>
        )}

        {loaded.schema.questions.length === 0 ? (
          <p className="text-[13px] text-zinc-500 dark:text-zinc-400">Ce questionnaire ne contient aucune question.</p>
        ) : (
          <form
            action={submitApprenantQuestionnaire}
            className="bg-white dark:bg-zinc-900 border border-zinc-200/70 dark:border-zinc-800 rounded-xl shadow-sm divide-y divide-zinc-200/70 dark:divide-zinc-800"
          >
            <input type="hidden" name="token" value={params.token} />
            <input type="hidden" name="assignmentId" value={params.assignmentId} />
            <input type="hidden" name="retour" value="stagiaire" />
            <QuestionRenderer questions={loaded.schema.questions} />
            <div className="px-6 py-4 flex items-center justify-between gap-3">
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400 inline-flex items-center gap-1.5">
                <ShieldCheck className="w-3 h-3" /> Données traitées RGPD
              </p>
              <button
                type="submit"
                className="bg-orange-500 hover:bg-orange-600 text-white text-[13px] font-medium px-4 h-10 rounded-lg inline-flex items-center gap-2"
              >
                <Send className="w-3.5 h-3.5" /> Envoyer mes réponses
              </button>
            </div>
          </form>
        )}
      </div>
    </main>
  );
}
