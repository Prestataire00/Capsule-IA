// ARCHETYPE: workflow
'use client';

import { useState, useTransition } from 'react';
import { Check, Loader2 } from 'lucide-react';
import { setModulePrice } from './actions';

function fmt(cents: number | null): string {
  if (cents == null) return '';
  return (cents / 100).toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

export function ModulePriceCell({ moduleId, priceCents }: { moduleId: string; priceCents: number | null }) {
  const [value, setValue] = useState(fmt(priceCents));
  const [saved, setSaved] = useState<number | null>(priceCents);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState(false);

  const dirty = value.trim() !== fmt(saved);

  const save = () => {
    if (!dirty) return;
    setError(false);
    startTransition(async () => {
      const res = await setModulePrice(moduleId, value);
      if (res.ok) {
        setSaved(res.priceCents);
        setValue(fmt(res.priceCents));
      } else {
        setError(true);
      }
    });
  };

  return (
    <div className="flex items-center gap-1.5 justify-end">
      <div className="relative">
        <input
          inputMode="decimal"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={save}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              (e.target as HTMLInputElement).blur();
            }
          }}
          placeholder="—"
          aria-label="Prix HT en euros"
          className={
            'w-28 text-right tabular-nums bg-white dark:bg-zinc-950 border rounded-md pl-2 pr-6 py-1 text-[13px] focus:outline-none transition ' +
            (error
              ? 'border-red-400 focus:border-red-500'
              : 'border-zinc-200/60 dark:border-zinc-800 focus:border-zinc-300 dark:focus:border-zinc-700')
          }
        />
        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[12px] text-zinc-400 pointer-events-none">€</span>
      </div>
      <span className="w-4 inline-flex justify-center">
        {pending ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin text-zinc-400" />
        ) : !dirty && saved != null ? (
          <Check className="w-3.5 h-3.5 text-emerald-500" />
        ) : null}
      </span>
    </div>
  );
}
