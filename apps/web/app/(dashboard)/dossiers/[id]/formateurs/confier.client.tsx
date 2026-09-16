'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, UserMinus, UserPlus } from 'lucide-react';
import { confierDossier, retirerDossier } from './actions';

export type FormateurOption = { id: string; label: string };

const champ =
  'text-[13px] px-3 h-9 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-orange-500/30';

/** Confier le dossier à un formateur de l'organisme. */
export function ConfierForm({ dossierId, disponibles }: { dossierId: string; disponibles: FormateurOption[] }) {
  const router = useRouter();
  const [trainerId, setTrainerId] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (disponibles.length === 0) {
    return (
      <p className="text-[13px] text-zinc-500 dark:text-zinc-400">
        Tous vos formateurs sont déjà rattachés à ce dossier.
      </p>
    );
  }

  return (
    <form
      className="flex flex-wrap items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (!trainerId) return;
        setErreur(null);
        start(async () => {
          const r = await confierDossier({ dossierId, trainerId });
          if (!r.ok) {
            setErreur(r.error);
            return;
          }
          setTrainerId('');
          router.refresh();
        });
      }}
    >
      <select value={trainerId} onChange={(e) => setTrainerId(e.target.value)} className={`${champ} max-w-[16rem]`}>
        <option value="">Choisir un formateur…</option>
        {disponibles.map((f) => (
          <option key={f.id} value={f.id}>
            {f.label}
          </option>
        ))}
      </select>
      <button
        type="submit"
        disabled={pending || !trainerId}
        className="inline-flex items-center gap-1.5 bg-orange-500 hover:bg-orange-600 text-white text-[13px] font-semibold px-3 h-9 rounded-lg disabled:opacity-40"
      >
        {pending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UserPlus className="w-3.5 h-3.5" />} Confier le
        dossier
      </button>
      {erreur && (
        <p role="alert" className="text-[12px] font-semibold text-rose-600 dark:text-rose-400 basis-full">
          {erreur}
        </p>
      )}
    </form>
  );
}

/** Retirer un formateur : il perd l'accès au dossier dans son espace. */
export function RetirerButton({
  dossierId,
  trainerId,
  nom,
}: {
  dossierId: string;
  trainerId: string;
  nom: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [erreur, setErreur] = useState<string | null>(null);

  return (
    <span className="inline-flex items-center gap-2">
      {erreur && <span role="alert" className="text-[11px] font-semibold text-rose-600 dark:text-rose-400">{erreur}</span>}
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          if (!window.confirm(`Retirer ${nom} de ce dossier ? Il n’y aura plus accès dans son espace.`)) return;
          setErreur(null);
          start(async () => {
            const r = await retirerDossier({ dossierId, trainerId });
            if (!r.ok) {
              setErreur(r.error);
              return;
            }
            router.refresh();
          });
        }}
        className="inline-flex items-center gap-1 text-[12px] font-semibold px-2.5 h-8 rounded-md border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300 hover:border-rose-300 hover:text-rose-700 dark:hover:border-rose-800 dark:hover:text-rose-300 transition disabled:opacity-50"
      >
        {pending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UserMinus className="w-3.5 h-3.5" />} Retirer
      </button>
    </span>
  );
}
