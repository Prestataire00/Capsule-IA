'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Send, Trophy, RotateCcw, ExternalLink } from 'lucide-react';
import type { Segment } from '@/features/pedagogie/cloze';
import type { Carte } from '@/features/pedagogie/kinds';
import { repondreAuTexteATrou } from './actions';

/**
 * Les formes que le stagiaire travaille en ligne, hors quiz : texte à trou,
 * cartes mémoire, vidéo.
 *
 * Les cartes ne sont pas notées et ne remontent rien : c'est de la révision.
 * Prétendre les évaluer donnerait une note qui ne veut rien dire.
 */

export function TexteATrouForm({
  token,
  quizId,
  segments,
  nbTrous,
}: {
  token: string;
  quizId: string;
  segments: readonly Segment[];
  nbTrous: number;
}) {
  const router = useRouter();
  const [donnees, setDonnees] = useState<string[]>(() => Array.from({ length: nbTrous }, () => ''));
  const [erreur, setErreur] = useState<string | null>(null);
  const [resultat, setResultat] = useState<{ note: number; bareme: number; pourcentage: number } | null>(null);
  const [pending, startTransition] = useTransition();

  const remplis = donnees.filter((d) => d.trim().length > 0).length;

  const envoyer = () => {
    setErreur(null);
    const restants = nbTrous - remplis;
    const message =
      restants > 0
        ? `${restants} trou${restants > 1 ? 's' : ''} sans réponse. Envoyer quand même ? Vous ne pourrez pas revenir en arrière.`
        : 'Envoyer vos réponses ? Vous ne pourrez pas revenir en arrière.';
    if (!window.confirm(message)) return;

    startTransition(async () => {
      const res = await repondreAuTexteATrou({ token, quizId, donnees });
      if (!res.ok) return setErreur(res.error);
      setResultat({ note: res.note, bareme: res.bareme, pourcentage: res.pourcentage });
      router.refresh();
    });
  };

  if (resultat) {
    return (
      <div className="rounded-lg border border-emerald-200 dark:border-emerald-900/50 bg-emerald-50 dark:bg-emerald-950/25 px-4 py-3">
        <p className="text-[14px] font-bold text-emerald-800 dark:text-emerald-300 inline-flex items-center gap-2">
          <Trophy className="w-4 h-4" />
          <span className="tabular-nums">
            {resultat.note} / {resultat.bareme}
          </span>
          <span className="font-normal text-[13px]">({resultat.pourcentage} %)</span>
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-[14px] leading-8 text-zinc-800 dark:text-zinc-200">
        {segments.map((seg, i) =>
          seg.type === 'texte' ? (
            <span key={i}>{seg.valeur}</span>
          ) : (
            <input
              key={i}
              value={donnees[seg.index] ?? ''}
              onChange={(e) =>
                setDonnees((d) => d.map((v, j) => (j === seg.index ? e.target.value : v)))
              }
              aria-label={`Trou ${seg.index + 1}`}
              maxLength={200}
              className="inline-block w-32 mx-1 px-2 h-8 rounded-md border border-orange-300 dark:border-orange-900/60 bg-orange-50/60 dark:bg-orange-950/30 text-[13px] text-zinc-900 dark:text-zinc-100 align-baseline"
            />
          ),
        )}
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={envoyer}
          disabled={pending}
          className="h-9 px-4 rounded-lg bg-orange-500 hover:bg-orange-600 text-white text-[13px] font-semibold inline-flex items-center gap-1.5 transition disabled:opacity-60"
        >
          {pending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
          Envoyer mes réponses
        </button>
        <span className="text-[12px] text-zinc-500 dark:text-zinc-400 tabular-nums">
          {remplis} / {nbTrous} remplis · ni la casse ni les accents ne comptent
        </span>
      </div>

      {erreur && <p className="text-[12px] text-red-600 dark:text-red-400">{erreur}</p>}
    </div>
  );
}

export function CartesMemoire({ cartes }: { cartes: readonly Carte[] }) {
  const [index, setIndex] = useState(0);
  const [retournee, setRetournee] = useState(false);
  const carte = cartes[index];
  if (!carte) return null;

  const suivante = () => {
    setRetournee(false);
    setIndex((i) => (i + 1) % cartes.length);
  };

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={() => setRetournee((r) => !r)}
        className="w-full min-h-32 rounded-xl border-2 border-dashed border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-4 py-6 text-center hover:border-orange-300 transition"
      >
        <span className="block text-[11px] font-bold uppercase tracking-wide text-zinc-400 mb-2">
          {retournee ? 'Réponse' : 'Question'}
        </span>
        <span className="block text-[15px] text-zinc-900 dark:text-zinc-100 whitespace-pre-wrap">
          {retournee ? carte.verso : carte.recto}
        </span>
        {!retournee && <span className="block text-[11px] text-zinc-400 mt-3">Cliquez pour retourner la carte</span>}
      </button>

      <div className="flex items-center justify-between gap-3">
        <span className="text-[12px] text-zinc-500 dark:text-zinc-400 tabular-nums">
          Carte {index + 1} / {cartes.length}
        </span>
        <button
          type="button"
          onClick={suivante}
          className="h-9 px-4 rounded-lg border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 text-[13px] font-medium inline-flex items-center gap-1.5 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition"
        >
          <RotateCcw className="w-3.5 h-3.5" /> Carte suivante
        </button>
      </div>
    </div>
  );
}

export function VideoExercice({ url }: { url: string }) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 text-[13px] font-semibold hover:opacity-90 transition"
    >
      <ExternalLink className="w-3.5 h-3.5" /> Regarder la vidéo
    </a>
  );
}
