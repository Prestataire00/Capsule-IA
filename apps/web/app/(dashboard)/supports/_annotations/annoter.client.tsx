'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Highlighter, Loader2, Trash2 } from 'lucide-react';
import { COULEURS, COULEUR_LABELS, COULEUR_TONS, type Couleur } from '@/features/pedagogie/annotations';
import { annotationSchema } from '@/features/pedagogie/annotations.schema';
import { annoterContenu, supprimerAnnotation } from '../annotations-actions';

/**
 * Annoter un contenu : une couleur, une cible (tout, une question, un
 * passage cité), un commentaire. Le passage cité se surligne dans le contenu.
 */
export function Annoter({
  targetKind,
  targetId,
  questions = [],
}: {
  targetKind: 'support' | 'cours';
  targetId: string;
  questions?: ReadonlyArray<{ id: string; label: string }>;
}) {
  const router = useRouter();
  const [ouvert, setOuvert] = useState(false);
  const [couleur, setCouleur] = useState<Couleur>('a_revoir');
  const [cible, setCible] = useState<string>('tout');
  const [extrait, setExtrait] = useState('');
  const [commentaire, setCommentaire] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (!ouvert) {
    return (
      <button
        type="button"
        onClick={() => setOuvert(true)}
        className="inline-flex items-center gap-1.5 text-[12px] font-medium text-zinc-600 dark:text-zinc-300 hover:text-orange-600 dark:hover:text-orange-400"
      >
        <Highlighter className="w-3.5 h-3.5" /> Annoter
      </button>
    );
  }

  const envoyer = () =>
    start(async () => {
      setErreur(null);
      const p = annotationSchema.safeParse({
        targetKind,
        targetId,
        couleur,
        commentaire,
        ...(cible.startsWith('q:') ? { questionId: cible.slice(2) } : {}),
        ...(cible === 'passage' && extrait.trim() ? { extrait } : {}),
      });
      if (!p.success) return setErreur(p.error.issues[0]?.message ?? 'Annotation invalide.');
      if (cible === 'passage' && !extrait.trim()) return setErreur('Collez le passage à surligner.');
      const r = await annoterContenu(p.data);
      if (!r.ok) return setErreur(r.error);
      setCommentaire('');
      setExtrait('');
      setOuvert(false);
      router.refresh();
    });

  return (
    <div className="w-full rounded-lg border border-zinc-200 dark:border-zinc-700 p-3 space-y-2.5">
      <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Couleur">
        {COULEURS.map((c) => (
          <button
            key={c}
            type="button"
            role="radio"
            aria-checked={couleur === c}
            onClick={() => setCouleur(c)}
            className={`h-7 px-2.5 rounded-md text-[12px] font-medium transition ${COULEUR_TONS[c].pastille} ${
              couleur === c ? 'ring-2 ring-offset-1 ring-zinc-900/60 dark:ring-zinc-100/60 dark:ring-offset-zinc-900' : 'opacity-70 hover:opacity-100'
            }`}
          >
            {COULEUR_LABELS[c]}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-2 items-center">
        <label className="text-[12px] text-zinc-500 dark:text-zinc-400" htmlFor={`cible-${targetId}`}>
          Sur
        </label>
        <select
          id={`cible-${targetId}`}
          value={cible}
          onChange={(e) => setCible(e.target.value)}
          className="h-8 rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2 text-[12px]"
        >
          <option value="tout">Tout le contenu</option>
          {questions.map((q) => (
            <option key={q.id} value={`q:${q.id}`}>
              {q.label}
            </option>
          ))}
          <option value="passage">Un passage précis</option>
        </select>
        {cible === 'passage' && (
          <input
            value={extrait}
            onChange={(e) => setExtrait(e.target.value)}
            maxLength={500}
            placeholder="Collez le passage concerné (ou « page 3, diapo 5 »)"
            className="flex-1 min-w-[12rem] h-8 rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2 text-[12px]"
          />
        )}
      </div>
      <textarea
        value={commentaire}
        onChange={(e) => setCommentaire(e.target.value)}
        rows={3}
        maxLength={2000}
        placeholder="Ce qui ne va pas, et ce qu'il faudrait à la place."
        className="w-full rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-2 text-[13px]"
      />
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={envoyer}
          disabled={pending}
          className="h-8 px-3 rounded-md bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 text-[12px] font-medium inline-flex items-center gap-1.5 disabled:opacity-50"
        >
          {pending && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Ajouter l&apos;annotation
        </button>
        <button type="button" onClick={() => setOuvert(false)} className="h-8 px-3 text-[12px] text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200">
          Annuler
        </button>
        {erreur && <span className="text-[12px] text-red-600 dark:text-red-400">{erreur}</span>}
      </div>
    </div>
  );
}

export function RetirerAnnotation({ annotationId }: { annotationId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [erreur, setErreur] = useState<string | null>(null);
  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await supprimerAnnotation(annotationId);
            if (r.ok) router.refresh();
            else setErreur(r.error);
          })
        }
        className="inline-flex items-center gap-1 text-[11px] text-zinc-500 hover:text-red-600 disabled:opacity-50"
      >
        <Trash2 className="w-3 h-3" /> Retirer
      </button>
      {erreur && <span className="text-[11px] text-red-600">{erreur}</span>}
    </span>
  );
}
