'use client';

// ARCHETYPE: command — ouverture / fermeture de l'espace d'un formateur.
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, LockKeyhole, LockKeyholeOpen, AlertCircle } from 'lucide-react';
import { setTrainerSpaceAccess } from './profile-actions';

/**
 * Couper l'accès d'un formateur demandait auparavant de supprimer sa fiche —
 * donc son historique et ses contrats. La fermeture est ici réversible et ne
 * touche à rien d'autre (audit CAP-30).
 */
export function SpaceAccess({
  trainerId,
  disabledAt,
  hasAccount,
}: {
  trainerId: string;
  disabledAt: string | null;
  hasAccount: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [confirme, setConfirme] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const ferme = disabledAt !== null;

  const basculer = (fermer: boolean) => {
    setErreur(null);
    start(async () => {
      const res = await setTrainerSpaceAccess(trainerId, fermer);
      if (res.ok) {
        setConfirme(false);
        router.refresh();
      } else {
        setErreur(res.error);
      }
    });
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[13px] text-zinc-900 dark:text-zinc-100">Espace formateur</p>
          <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
            {ferme
              ? "Accès fermé — le formateur ne peut plus ouvrir son espace."
              : hasAccount
                ? 'Accès ouvert.'
                : "Accès ouvert — le formateur n'a pas encore activé son compte."}
          </p>
        </div>

        {ferme ? (
          <button
            type="button"
            onClick={() => basculer(false)}
            disabled={pending}
            className="flex-shrink-0 inline-flex items-center gap-1.5 text-[12px] font-medium px-3 py-1.5 rounded-lg border border-zinc-200/60 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-950 transition disabled:opacity-40"
          >
            {pending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <LockKeyholeOpen className="w-3.5 h-3.5" />}
            Rouvrir l&apos;accès
          </button>
        ) : (
          !confirme && (
            <button
              type="button"
              onClick={() => setConfirme(true)}
              disabled={pending}
              className="flex-shrink-0 inline-flex items-center gap-1.5 text-[12px] font-medium px-3 py-1.5 rounded-lg border border-zinc-200/60 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 hover:border-red-300 hover:text-red-600 dark:hover:text-red-400 transition disabled:opacity-40"
            >
              <LockKeyhole className="w-3.5 h-3.5" />
              Fermer l&apos;accès
            </button>
          )
        )}
      </div>

      {confirme && !ferme && (
        <div className="p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200/60 dark:border-amber-900/40 rounded-lg space-y-2">
          <p className="text-[12px] text-amber-900 dark:text-amber-200">
            Le formateur ne pourra plus ouvrir son espace. Sa fiche, ses documents et ses
            rattachements restent intacts, et vous pouvez rouvrir l&apos;accès à tout moment.
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => basculer(true)}
              disabled={pending}
              className="bg-red-600 hover:bg-red-700 text-white text-[12px] font-medium px-3 py-1.5 rounded-lg transition shadow-sm disabled:opacity-40"
            >
              {pending ? 'Fermeture…' : 'Fermer l’accès'}
            </button>
            <button
              type="button"
              onClick={() => setConfirme(false)}
              className="text-[11px] text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 transition"
            >
              Annuler
            </button>
          </div>
        </div>
      )}

      {erreur && (
        <div className="flex items-start gap-2 p-2.5 bg-red-50 dark:bg-red-950/30 border border-red-200/60 dark:border-red-900/40 rounded-lg">
          <AlertCircle className="w-3.5 h-3.5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
          <p className="text-[12px] text-red-900 dark:text-red-200">{erreur}</p>
        </div>
      )}
    </div>
  );
}
