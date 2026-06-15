// ARCHETYPE: shared
'use client';

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/shared/lib/cn';

export function AccordionSection({
  title,
  description,
  icon,
  defaultOpen = false,
  children,
}: {
  title: string;
  description?: string;
  icon?: React.ReactNode;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section className="bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-xl shadow-sm overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full flex items-center gap-3 px-5 py-4 text-left hover:bg-zinc-50/60 dark:hover:bg-zinc-950/40 transition"
      >
        {icon && (
          <span className="w-8 h-8 rounded-lg bg-violet-50 dark:bg-violet-950/40 text-violet-600 dark:text-violet-300 flex items-center justify-center shrink-0">
            {icon}
          </span>
        )}
        <span className="flex-1 min-w-0">
          <span className="block text-[14px] font-medium text-zinc-900 dark:text-zinc-100">{title}</span>
          {description && (
            <span className="block text-[12px] text-zinc-500 dark:text-zinc-400 mt-0.5">{description}</span>
          )}
        </span>
        <ChevronDown
          className={cn('w-4 h-4 text-zinc-400 transition-transform shrink-0', open && 'rotate-180')}
        />
      </button>
      {open && (
        <div className="px-5 pb-6 pt-1 border-t border-zinc-200/60 dark:border-zinc-800 space-y-4">
          {children}
        </div>
      )}
    </section>
  );
}
