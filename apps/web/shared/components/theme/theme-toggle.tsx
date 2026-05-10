// ARCHETYPE: shared
'use client';

import { useEffect, useRef, useState } from 'react';
import { Sun, Moon, Monitor, Check } from 'lucide-react';
import { useTheme, type Theme } from './theme-provider';
import { cn } from '@/shared/lib/cn';

const options: { value: Theme; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { value: 'light', label: 'Clair', icon: Sun },
  { value: 'dark', label: 'Sombre', icon: Moon },
  { value: 'system', label: 'Système', icon: Monitor },
];

export function ThemeToggle() {
  const { theme, resolved, setTheme } = useTheme();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on click outside
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('mousedown', handler);
    return () => window.removeEventListener('mousedown', handler);
  }, [open]);

  // Avoid hydration mismatch — render an inert placeholder until mounted
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const ActiveIcon = resolved === 'dark' ? Moon : Sun;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Changer le thème"
        aria-haspopup="menu"
        aria-expanded={open}
        className="w-9 h-9 rounded-lg flex items-center justify-center text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-900 hover:text-zinc-900 dark:hover:text-zinc-100 transition"
      >
        {mounted ? <ActiveIcon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 mt-1.5 w-44 bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-lg shadow-md py-1 z-50"
        >
          {options.map((o) => {
            const Icon = o.icon;
            const active = theme === o.value;
            return (
              <button
                key={o.value}
                role="menuitem"
                type="button"
                onClick={() => {
                  setTheme(o.value);
                  setOpen(false);
                }}
                className={cn(
                  'w-full px-3 py-2 flex items-center gap-2.5 text-[13px] transition',
                  active
                    ? 'text-violet-700 dark:text-violet-300 bg-violet-50 dark:bg-violet-950/40'
                    : 'text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800',
                )}
              >
                <Icon className={cn('w-4 h-4', active ? 'text-violet-600 dark:text-violet-400' : 'text-zinc-400')} />
                <span className="flex-1 text-left">{o.label}</span>
                {active && <Check className="w-3.5 h-3.5 text-violet-600 dark:text-violet-400" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
