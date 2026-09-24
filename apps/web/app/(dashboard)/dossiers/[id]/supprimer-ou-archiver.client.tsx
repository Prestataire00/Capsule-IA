'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Archive, Loader2, Trash2 } from 'lucide-react';
import { useAction } from 'next-safe-action/hooks';
import { supprimerEntite } from '@/features/corbeille/actions';
import { changeDossierStatus } from './status-actions';

/**
 * Supprimer un dossier, ou l'archiver.
 *
 * Le bouton menait droit à la corbeille, et un dossier dont la convention était
 * signée s'entendait répondre « la suppression a échoué » — un garde-fou
 * (0073) refusait de poser `deleted_at`, au nom de Qualiopi. Or la suppression
 * est réversible ici : la ligne reste en base et se restaure depuis la
 * corbeille. Le garde-fou interdisait donc de ranger, pas de détruire ; il a
 * été levé pour ce chemin (0193), l'effacement réel restant bloqué.
 *
 * Reste la bonne question, que l'écran pose maintenant au lieu de trancher tout
 * seul : archiver ou supprimer. L'archivage garde le dossier consultable et ses
 * preuves à leur place — c'est ce qu'on attend d'une formation qui a eu lieu.
 * La corbeille convient à ce qui n'aurait pas dû exister : un doublon, un essai.
 */
const ERREURS: Record<string, string> = {
  unauthenticated: 'Session expirée — reconnectez-vous.',
  forbidden: 'Votre rôle ne permet pas cette action.',
  not_found: 'Dossier introuvable.',
  suppression_impossible: 'La suppression a échoué.',
  invalid_transition: 'Archivage impossible depuis ce statut : clôturez d’abord le dossier.',
};

export function SupprimerOuArchiver({
  dossierId,
  reference,
  conventionSignee,
}: {
  dossierId: string;
  reference: string;
  /** Change ce qui est conseillé, pas ce qui est permis. */
  conventionSignee: boolean;
}) {
  const router = useRouter();
  const [ouvert, setOuvert] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, demarrer] = useTransition();
  const [geste, setGeste] = useState<'archiver' | 'supprimer' | null>(null);
  const { executeAsync: changerStatut } = useAction(changeDossierStatus);

  const archiver = () => {
    setErreur(null);
    setGeste('archiver');
    demarrer(async () => {
      const r = await changerStatut({ dossierId, to: 'archived' });
      const out = r?.data;
      if (out?.ok) {
        setOuvert(false);
        router.refresh();
      } else {
        // `message` porte la raison exacte quand un indicateur Qualiopi bloque.
        setErreur(
          (out && 'message' in out ? out.message : undefined) ??
            ERREURS[(out as { error?: string } | undefined)?.error ?? ''] ??
            'L’archivage a échoué.',
        );
      }
      setGeste(null);
    });
  };

  const supprimer = () => {
    setErreur(null);
    setGeste('supprimer');
    demarrer(async () => {
      const r = await supprimerEntite('dossier', dossierId);
      if (r.ok) router.push('/dossiers');
      else {
        setErreur(ERREURS[r.error] ?? 'La suppression a échoué.');
        setGeste(null);
      }
    });
  };

  if (!ouvert) {
    return (
      <button
        type="button"
        onClick={() => {
          setErreur(null);
          setOuvert(true);
        }}
        className="text-[13px] font-semibold px-3 h-9 rounded-lg border border-rose-200/80 dark:border-rose-900/60 bg-white/70 dark:bg-zinc-900/60 text-rose-700 dark:text-rose-300 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition inline-flex items-center gap-1.5"
      >
        <Trash2 className="w-3.5 h-3.5" /> Supprimer
      </button>
    );
  }

  return (
    <div
      role="dialog"
      aria-label={`Supprimer ou archiver le dossier ${reference}`}
      className="rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 shadow-md p-4 max-w-md"
    >
      <p className="text-[14px] font-bold text-zinc-900 dark:text-zinc-100">Archiver ce dossier ?</p>
      <p className="text-[12px] text-zinc-600 dark:text-zinc-400 mt-1">
        {conventionSignee
          ? 'Sa convention est signée. L’archiver le retire des listes en gardant la formation et ses preuves — c’est ce que Qualiopi attend. La corbeille le retire aussi, et reste réversible.'
          : 'L’archivage le retire des listes en gardant tout son contenu. La corbeille convient à ce qui n’aurait pas dû exister — un doublon, un essai ; il reste restaurable.'}
      </p>

      {erreur && (
        <p role="alert" className="text-[12px] font-semibold text-rose-600 dark:text-rose-400 mt-2">
          {erreur}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2 mt-3">
        <button
          type="button"
          onClick={archiver}
          disabled={enCours}
          className="h-9 px-3 rounded-lg bg-orange-500 hover:bg-orange-600 text-white text-[13px] font-semibold transition inline-flex items-center gap-1.5 disabled:opacity-50"
        >
          {enCours && geste === 'archiver' ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Archive className="w-3.5 h-3.5" />
          )}
          Oui, archiver
        </button>
        <button
          type="button"
          onClick={supprimer}
          disabled={enCours}
          className="h-9 px-3 rounded-lg border border-rose-200/80 dark:border-rose-900/60 text-rose-700 dark:text-rose-300 text-[13px] font-semibold hover:bg-rose-50 dark:hover:bg-rose-950/40 transition inline-flex items-center gap-1.5 disabled:opacity-50"
        >
          {enCours && geste === 'supprimer' ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Trash2 className="w-3.5 h-3.5" />
          )}
          Non, mettre à la corbeille
        </button>
        <button
          type="button"
          onClick={() => setOuvert(false)}
          disabled={enCours}
          className="h-9 px-2.5 rounded-lg text-[13px] text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition disabled:opacity-50"
        >
          Annuler
        </button>
      </div>
    </div>
  );
}
