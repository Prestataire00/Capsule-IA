'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, MessageSquarePlus, Pencil } from 'lucide-react';
import { commenterDocument } from './commentaire-actions';

/**
 * Le commentaire d'un document, lu et corrigé sur sa ligne.
 *
 * Ce qu'on a à dire d'une pièce vient souvent après l'avoir déposée : la page
 * qui manque, la relance faite, la version attendue. Affiché sous l'intitulé,
 * il se lit sans ouvrir le document — c'est tout l'intérêt d'une note.
 */
export function CommentaireDocument({
  documentId,
  dossierId,
  initial,
  peutModifier,
}: {
  documentId: string;
  dossierId: string;
  initial: string | null;
  peutModifier: boolean;
}) {
  const router = useRouter();
  const [ouvert, setOuvert] = useState(false);
  const [texte, setTexte] = useState(initial ?? '');
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, demarrer] = useTransition();

  if (!ouvert) {
    if (!initial) {
      if (!peutModifier) return null;
      return (
        <button
          type="button"
          onClick={() => setOuvert(true)}
          className="mt-0.5 inline-flex items-center gap-1 text-[11px] text-zinc-400 hover:text-orange-600 dark:hover:text-orange-400 transition"
        >
          <MessageSquarePlus className="w-3 h-3" /> Commenter
        </button>
      );
    }
    return (
      <span className="mt-0.5 flex items-start gap-1.5">
        <span className="text-[12px] text-zinc-600 dark:text-zinc-400 whitespace-pre-wrap break-words">
          {initial}
        </span>
        {peutModifier && (
          <button
            type="button"
            onClick={() => setOuvert(true)}
            title="Modifier le commentaire"
            aria-label="Modifier le commentaire"
            className="shrink-0 text-zinc-400 hover:text-orange-600 dark:hover:text-orange-400 transition"
          >
            <Pencil className="w-3 h-3" />
          </button>
        )}
      </span>
    );
  }

  return (
    <span className="mt-1 block">
      <textarea
        value={texte}
        onChange={(e) => setTexte(e.target.value)}
        rows={2}
        maxLength={1000}
        autoFocus
        aria-label="Commentaire du document"
        placeholder="Reçu signé le 24/09, il manque la page 3."
        className="w-full text-[12px] px-2 py-1.5 rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-orange-500/30"
      />
      <span className="flex items-center gap-2 mt-1">
        <button
          type="button"
          disabled={enCours}
          onClick={() => {
            setErreur(null);
            demarrer(async () => {
              const r = await commenterDocument({ documentId, dossierId, texte: texte.trim() });
              if (r.ok) {
                setOuvert(false);
                router.refresh();
              } else setErreur(r.error);
            });
          }}
          className="h-7 px-2.5 rounded-md bg-orange-500 hover:bg-orange-600 text-white text-[11px] font-semibold inline-flex items-center gap-1 disabled:opacity-50"
        >
          {enCours && <Loader2 className="w-3 h-3 animate-spin" />} Enregistrer
        </button>
        <button
          type="button"
          disabled={enCours}
          onClick={() => {
            setTexte(initial ?? '');
            setOuvert(false);
          }}
          className="h-7 px-2 rounded-md text-[11px] text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-50"
        >
          Annuler
        </button>
        <span className="text-[11px] text-zinc-400">Vider le champ retire le commentaire.</span>
      </span>
      {erreur && (
        <span role="alert" className="block text-[11px] font-semibold text-rose-600 dark:text-rose-400 mt-1">
          {erreur}
        </span>
      )}
    </span>
  );
}
