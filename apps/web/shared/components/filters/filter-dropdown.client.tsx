'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, ChevronDown, ListFilter } from 'lucide-react';

type Option = { value: string; label: string };

/**
 * Filtre déroulant générique piloté par l'URL (mono ou multi-sélection).
 * Le composant est sans état de sélection : la source de vérité est l'URL.
 */
export function FilterDropdown({
  label,
  paramName,
  options,
  selected,
  basePath,
  preserved = {},
  multi = false,
}: {
  label: string;
  paramName: string;
  options: Option[];
  selected: string[];
  basePath: string;
  preserved?: Record<string, string | undefined>;
  multi?: boolean;
}) {
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
    for (const [k, v] of Object.entries(preserved)) if (v) params.set(k, v);
    next.forEach((s) => params.append(paramName, s));
    const qs = params.toString();
    return qs ? `${basePath}?${qs}` : basePath;
  };

  const choose = (value: string) => {
    const next = multi
      ? selected.includes(value)
        ? selected.filter((x) => x !== value)
        : [...selected, value]
      : selected.includes(value)
        ? []
        : [value];
    router.push(hrefFor(next), { scroll: false });
    if (!multi) setOpen(false);
  };

  const count = selected.length;
  const current = !multi && count === 1 ? options.find((o) => o.value === selected[0])?.label : null;

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`inline-flex items-center gap-2 h-9 bg-white dark:bg-zinc-900 border rounded-lg px-3 text-[13px] font-medium transition focus:outline-none focus-visible:border-orange-300 focus-visible:ring-4 focus-visible:ring-orange-500/10 ${
          count > 0
            ? 'border-orange-300 dark:border-orange-800 text-orange-700 dark:text-orange-300'
            : 'border-zinc-200/80 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 hover:border-zinc-300 dark:hover:border-zinc-700'
        }`}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <ListFilter className={`w-3.5 h-3.5 ${count > 0 ? 'text-orange-500' : 'text-zinc-400'}`} />
        {current ?? label}
        {multi && count > 0 && (
          <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-orange-500 text-white text-[10px] font-bold tabular-nums">
            {count}
          </span>
        )}
        <ChevronDown className={`w-3.5 h-3.5 text-zinc-400 transition ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute right-0 mt-1 w-56 bg-white dark:bg-zinc-900 border border-zinc-200/70 dark:border-zinc-800 rounded-xl shadow-lg z-20 py-1">
          <ul role="listbox" aria-multiselectable={multi} className="max-h-72 overflow-auto">
            {options.map((o) => {
              const on = selected.includes(o.value);
              return (
                <li key={o.value}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={on}
                    onClick={() => choose(o.value)}
                    className="w-full flex items-center gap-2.5 px-3 py-1.5 text-[13px] text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800/60 transition text-left"
                  >
                    <span
                      className={`w-4 h-4 ${multi ? 'rounded' : 'rounded-full'} border flex items-center justify-center shrink-0 transition ${
                        on ? 'bg-orange-500 border-orange-500 text-white' : 'border-zinc-300 dark:border-zinc-600'
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
            <div className="border-t border-zinc-200/70 dark:border-zinc-800 mt-1 pt-1">
              <button
                type="button"
                onClick={() => {
                  router.push(hrefFor([]), { scroll: false });
                  setOpen(false);
                }}
                className="w-full text-left px-3 py-1.5 text-[12px] text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-50 dark:hover:bg-zinc-800/60 transition"
              >
                Effacer
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
