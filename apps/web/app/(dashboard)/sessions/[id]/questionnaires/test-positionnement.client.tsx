'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Loader2, QrCode, Sparkles } from 'lucide-react';
import { genererTestDeLaSeance } from './test-positionnement-actions';

/**
 * Le test de positionnement de la formation : généré par l'IA à partir des
 * objectifs du programme (deux questions par objectif), puis projeté en QR
 * code au démarrage de la séance.
 */
export function TestPositionnement({ sessionId, test, gerer }: { sessionId: string; test: { id: string; questions: number } | null; gerer: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [erreur, setErreur] = useState<string | null>(null);

  const generer = () => {
    if (test && !window.confirm('Régénérer le test ? Les questions actuelles seront remplacées.')) return;
    setErreur(null);
    start(async () => {
      const r = await genererTestDeLaSeance(sessionId);
      if (!r.ok) setErreur(r.error);
      else router.refresh();
    });
  };

  return (
    <section className="rounded-xl border border-purple-200/70 dark:border-purple-900/50 bg-purple-50/40 dark:bg-purple-950/10 p-4 flex items-start gap-3 flex-wrap">
      <span className="w-9 h-9 rounded-lg grid place-items-center bg-purple-100 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300 shrink-0">
        <Sparkles className="w-4 h-4" aria-hidden />
      </span>
      <div className="min-w-[14rem] flex-1">
        <h3 className="text-[14px] font-semibold text-zinc-900 dark:text-zinc-100">Test de positionnement</h3>
        <p className="text-[12px] text-zinc-600 dark:text-zinc-400">
          {test
            ? `${test.questions} questions, deux par objectif du programme. À projeter au démarrage : chaque stagiaire répond sur son téléphone, sans e-mail.`
            : 'Généré par l’IA à partir des objectifs du programme : deux questions par objectif. Le formateur le projette en QR code au démarrage.'}
        </p>
        {erreur && <p className="text-[12px] text-red-600 dark:text-red-400 mt-1">{erreur}</p>}
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        {test && (
          <>
            <a
              href={`/projection/questionnaire/${sessionId}/${test.id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-orange-500 hover:bg-orange-600 text-white text-[12px] font-medium shadow-sm"
            >
              <QrCode className="w-3.5 h-3.5" /> Projeter le test
            </a>
            <Link
              href={`/sessions/${sessionId}/questionnaires/${test.id}`}
              className="inline-flex items-center h-8 px-3 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-[12px] font-medium text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-800"
            >
              Questions et réponses
            </Link>
          </>
        )}
        {gerer && (
          <button
            type="button"
            onClick={generer}
            disabled={pending}
            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-purple-200 dark:border-purple-800 bg-white dark:bg-zinc-900 text-[12px] font-medium text-purple-700 dark:text-purple-300 hover:bg-purple-50 dark:hover:bg-purple-950/30 disabled:opacity-50"
          >
            {pending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
            {pending ? 'Génération…' : test ? 'Régénérer' : 'Générer avec l’IA'}
          </button>
        )}
      </div>
    </section>
  );
}
