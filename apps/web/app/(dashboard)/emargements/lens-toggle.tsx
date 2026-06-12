'use client';

import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { cn } from '@/shared/lib/cn';
import type { Lens } from '@/features/attendance/queries/attendance-consolidated.types';

const OPTIONS: ReadonlyArray<{ value: Lens; label: string }> = [
  { value: 'session', label: 'Par session' },
  { value: 'company', label: 'Par entreprise' },
  { value: 'trainer', label: 'Par formateur' },
];

export function LensToggle({ active }: { active: Lens }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const select = (lens: Lens) => {
    const next = new URLSearchParams(params.toString());
    next.set('lens', lens);
    router.push(`${pathname}?${next.toString()}`);
  };

  return (
    <div className="inline-flex rounded-lg border border-zinc-200/60 dark:border-zinc-800 p-0.5 bg-zinc-50/60 dark:bg-zinc-950/40">
      {OPTIONS.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => select(o.value)}
          className={cn(
            'px-3 py-1.5 text-[13px] rounded-md transition',
            active === o.value
              ? 'bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 shadow-sm font-medium'
              : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
