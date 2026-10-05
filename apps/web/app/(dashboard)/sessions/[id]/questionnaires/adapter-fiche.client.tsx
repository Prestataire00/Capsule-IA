'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Loader2, Pencil, Sparkles } from 'lucide-react';
import { adapterFicheBesoin } from './actions';

/**
 * La fiche besoin de la formation : la faire rédiger par l'IA, puis la relire
 * et la modifier. Une fiche générique ne situe pas un stagiaire dans le sujet.
 */
export function AdapterFiche({
  sessionId,
  formation,
  ficheAdaptee,
  gerer,
}: {
  sessionId: string;
  formation: string | null;
  ficheAdaptee: { id: string; titre: string; questions: number } | null;
  gerer: boolean;
}) {
  const router = useRouter();
  const [erreur, setErreur] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const adapter = () => {
    if (ficheAdaptee && !confirm('Réécrire les questions de la fiche avec l’IA ? Vos modifications seront remplacées.')) return;
    setErreur(null);
    start(async () => {
      const r = await adapterFicheBesoin(sessionId);
      if (r.ok) router.push(`/questionnaires/${r.templateId}`);
      else setErreur(r.error);
    });
  };

  return (
    <section className="rounded-xl border border-purple-200/70 dark:border-purple-900/50 bg-gradient-to-br from-purple-50 to-white dark:from-purple-950/30 dark:to-zinc-900 p-4 flex items-start gap-3 flex-wrap shadow-sm">
      <span className="w-9 h-9 rounded-lg grid place-items-center shrink-0 bg-purple-100 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300">
        <Sparkles className="w-4 h-4" />
      </span>
      <div className="min-w-0 flex-1">
        <h2 className="text-[15px] font-medium text-zinc-900 dark:text-zinc-100">
          {ficheAdaptee ? ficheAdaptee.titre : 'Fiche besoin adaptée à la formation'}
        </h2>
        <p className="text-[13px] text-zinc-600 dark:text-zinc-400 mt-0.5">
          {!formation
            ? 'Rattachez une formation à la séance, ou donnez-lui un titre et des notes : l’IA s’en inspire pour la fiche besoin.'
            : ficheAdaptee
              ? `${ficheAdaptee.questions} questions propres à « ${formation} ». C’est elle que reçoivent les stagiaires de cette formation.`
              : `L’IA lit le détail de « ${formation} » (description, objectifs, programme, méthodes) et rédige les questions qui y situent chaque stagiaire (ex. « Avez-vous déjà utilisé une IA ? »), en plus du niveau, des objectifs et des aménagements. Vous la relisez ensuite.`}
        </p>
        {erreur && <p role="alert" className="text-[12px] text-red-600 dark:text-red-400 mt-1">{erreur}</p>}
      </div>
      {gerer && formation && (
        <div className="flex items-center gap-2 flex-wrap">
          {ficheAdaptee && (
            <Link
              href={`/questionnaires/${ficheAdaptee.id}`}
              className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-[13px] font-medium text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-800"
            >
              <Pencil className="w-4 h-4" /> Voir et modifier
            </Link>
          )}
          <button
            type="button"
            onClick={adapter}
            disabled={pending}
            className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-lg border border-purple-200 dark:border-purple-800 bg-white dark:bg-zinc-900 text-[13px] font-medium text-purple-700 dark:text-purple-300 hover:bg-purple-50 dark:hover:bg-purple-950/40 disabled:opacity-60"
          >
            {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            {pending ? 'L’IA rédige…' : ficheAdaptee ? 'Régénérer avec l’IA' : 'Adapter avec l’IA'}
          </button>
        </div>
      )}
    </section>
  );
}
