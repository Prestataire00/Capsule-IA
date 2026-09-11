'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, ChevronDown, ListFilter } from 'lucide-react';

type Option = { value: string; label: string };

/** Filtre statut des dossiers : menu déroulant multi-sélection (source de vérité = URL). */
export function StatusFilter({ options, selected, q, view }: { options: Option[]; selected: string[]; q?: string; view?: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const hrefFor = (next: string[]) => {
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    next.forEach((s) => params.append('status', s));
    if (view) params.set('view', view);
    const qs = params.toString();
    return qs ? `/dossiers?${qs}` : '/dossiers';
  };

  const toggle = (value: string) => {
    const next = selected.includes(value) ? selected.filter((x) => x !== value) : [...selected, value];
    router.push(hrefFor(next), { scroll: false });
  };

  const count = selected.length;

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-2 h-9 bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800 rounded-lg px-3 text-[13px] font-semibold text-zinc-700 dark:text-zinc-300 hover:border-zinc-300 dark:hover:border-zinc-700 transition focus:outline-none focus:border-orange-300 dark:focus:border-orange-800 focus:ring-4 focus:ring-orange-500/10"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <ListFilter className="w-3.5 h-3.5 text-zinc-400" />
        Statut
        {count > 0 && (
          <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-orange-500 text-white text-[10px] font-bold tabular-nums">
            {count}
          </span>
        )}
        <ChevronDown className={`w-3.5 h-3.5 text-zinc-400 transition ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute left-0 mt-1 w-56 bg-white dark:bg-zinc-900 border border-zinc-200/70 dark:border-zinc-800 rounded-xl shadow-lg z-20 py-1">
          <ul role="listbox" aria-multiselectable className="max-h-72 overflow-auto">
            {options.map((o) => {
              const on = selected.includes(o.value);
              return (
                <li key={o.value}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={on}
                    onClick={() => toggle(o.value)}
                    className="w-full flex items-center gap-2.5 px-3 py-1.5 text-[13px] text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800/60 transition text-left"
                  >
                    <span
                      className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition ${
                        on
                          ? 'bg-orange-500 border-orange-500 text-white'
                          : 'border-zinc-300 dark:border-zinc-600'
                      }`}
                    >
                      {on && <Check className="w-3 h-3" />}
                    </span>
                    {o.label}
                  </button>
                </li>
              );
            })}
          </ul>
          {count > 0 && (
            <div className="border-t border-zinc-200/60 dark:border-zinc-800 mt-1 pt-1">
              <button
                type="button"
                onClick={() => router.push(hrefFor([]), { scroll: false })}
                className="w-full text-left px-3 py-1.5 text-[12px] text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-50 dark:hover:bg-zinc-800/60 transition"
              >
                Effacer les statuts
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
