// ARCHETYPE: shared
'use client';

import { useEffect, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/shared/lib/cn';

export function AccordionSection({
  title,
  description,
  icon,
  defaultOpen = false,
  forceOpen = false,
  children,
}: {
  title: string;
  description?: string;
  icon?: React.ReactNode;
  defaultOpen?: boolean;
  /** Passe à true pour rouvrir la section de force (ex. champ invalide dedans). */
  forceOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  // Rouvre la section quand un parent signale une erreur à l'intérieur.
  useEffect(() => {
    if (forceOpen) setOpen(true);
  }, [forceOpen]);

  return (
    <section className="bg-white dark:bg-zinc-900 border border-zinc-200/70 dark:border-zinc-800 rounded-xl shadow-sm overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full flex items-center gap-3 px-5 py-4 text-left hover:bg-zinc-50/60 dark:hover:bg-zinc-950/40 transition"
      >
        {icon && (
          <span className="w-5 h-5 text-zinc-400 dark:text-zinc-500 flex items-center justify-center shrink-0">
            {icon}
          </span>
        )}
        <span className="flex-1 min-w-0">
          <span className="block text-[15px] font-bold text-zinc-900 dark:text-zinc-100">{title}</span>
          {description && (
            <span className="block text-[12px] text-zinc-500 dark:text-zinc-400 mt-0.5">{description}</span>
          )}
        </span>
        <ChevronDown
          className={cn('w-4 h-4 text-zinc-400 transition-transform shrink-0', open && 'rotate-180')}
        />
      </button>
      {open && (
        <div className="px-5 pb-6 pt-1 border-t border-zinc-200/70 dark:border-zinc-800 space-y-4">
          {children}
        </div>
      )}
    </section>
  );
}
