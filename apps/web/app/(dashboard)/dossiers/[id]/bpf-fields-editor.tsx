'use client';

import { useState, useTransition } from 'react';
import { GraduationCap, Loader2 } from 'lucide-react';
import { setDossierBpfFields } from './actions';
import { ACTION_TYPES, TRAINEE_CATEGORIES } from '@/features/formations/constants';
import { inputClass } from '@/shared/ui/form-field';

export function BpfFieldsEditor({
  dossierId,
  initialActionType,
  initialTraineeCategory,
}: {
  dossierId: string;
  initialActionType: string | null;
  initialTraineeCategory: string | null;
}) {
  const [actionType, setActionType] = useState(initialActionType ?? '');
  const [category, setCategory] = useState(initialTraineeCategory ?? '');
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const persist = (nextAction: string, nextCategory: string) => {
    setError(null);
    startTransition(async () => {
      const res = await setDossierBpfFields(dossierId, nextAction || null, nextCategory || null);
      if (!res.ok) setError(res.error);
    });
  };

  return (
    <div className="bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-lg px-4 py-4">
      <div className="flex items-center gap-2 mb-3">
        <GraduationCap className="w-3.5 h-3.5 text-zinc-400" />
        <p className="text-[11px] uppercase tracking-wider text-zinc-500">Classification BPF</p>
        {pending && <Loader2 className="w-3 h-3 animate-spin text-zinc-400" />}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="block">
          <span className="text-[12px] font-medium text-zinc-700 dark:text-zinc-300 block mb-1.5">Type d&apos;action</span>
          <select
            value={actionType}
            disabled={pending}
            onChange={(e) => {
              setActionType(e.target.value);
              persist(e.target.value, category);
            }}
            className={inputClass}
          >
            <option value="">— Non renseigné —</option>
            {ACTION_TYPES.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="text-[12px] font-medium text-zinc-700 dark:text-zinc-300 block mb-1.5">Catégorie de stagiaire</span>
          <select
            value={category}
            disabled={pending}
            onChange={(e) => {
              setCategory(e.target.value);
              persist(actionType, e.target.value);
            }}
            className={inputClass}
          >
            <option value="">— Non renseigné —</option>
            {TRAINEE_CATEGORIES.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </label>
      </div>

      <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-2">
        Pré-remplis automatiquement (financeur, statut, formation) et utilisés dans le Bilan Pédagogique et Financier. Corrigez-les si besoin.
      </p>
      {error && <p className="text-[12px] text-red-600 dark:text-red-400 mt-2">Erreur : {error}</p>}
    </div>
  );
}
