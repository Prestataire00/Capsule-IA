'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Check, ChevronDown, Building2 } from 'lucide-react';
import { cn } from '@/shared/lib/cn';
import type { TrainerMembership } from '@/features/identity/trainer-self/application/ports';

const PALETTE = ['orange', 'rose', 'blue', 'purple', 'emerald', 'amber'] as const;
function colorFor(orgId: string): string {
  let h = 0;
  for (let i = 0; i < orgId.length; i++) h = (h * 31 + orgId.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length]!;
}

export function OfSwitcher({
  memberships,
  current,
}: {
  memberships: TrainerMembership[];
  current: string;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  if (memberships.length <= 1) {
    const only = memberships[0];
    if (!only) return null;
    return (
      <div className="inline-flex items-center gap-1.5 text-[12px] text-zinc-600 dark:text-zinc-400">
        <Building2 className="w-3.5 h-3.5" />
        <span>{only.organizationName}</span>
      </div>
    );
  }

  const currentLabel =
    current === 'all' ? 'Tous mes OF'
    : memberships.find(m => m.organizationId === current)?.organizationName ?? 'Tous mes OF';

  const setFocus = (orgId: string) => {
    startTransition(async () => {
      await fetch('/api/set-focus', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ organizationId: orgId }),
      });
      router.refresh();
      setOpen(false);
    });
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        disabled={pending}
        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-zinc-200/60 dark:border-zinc-800 text-[12px] hover:bg-zinc-50 dark:hover:bg-zinc-900 transition"
      >
        <Building2 className="w-3.5 h-3.5 text-zinc-500" />
        <span className="font-medium">{currentLabel}</span>
        <ChevronDown className="w-3 h-3 text-zinc-400" />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1.5 min-w-[260px] bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-md z-50">
          <button
            type="button"
            onClick={() => setFocus('all')}
            className={cn(
              'w-full text-left px-3 py-2 flex items-center gap-2 text-[13px] hover:bg-zinc-50 dark:hover:bg-zinc-900 transition first:rounded-t-xl',
              current === 'all' && 'bg-zinc-50 dark:bg-zinc-900',
            )}
          >
            <span className="flex -space-x-1">
              {memberships.slice(0, 3).map(m => (
                <span key={m.organizationId} className={`w-2 h-2 rounded-full bg-${colorFor(m.organizationId)}-400 ring-1 ring-white dark:ring-zinc-950`} />
              ))}
            </span>
            <span className="flex-1">Tous mes OF</span>
            {current === 'all' && <Check className="w-3.5 h-3.5 text-zinc-500" />}
          </button>
          <div className="border-t border-zinc-100 dark:border-zinc-900" />
          {memberships.map(m => (
            <button
              key={m.organizationId}
              type="button"
              onClick={() => setFocus(m.organizationId)}
              className={cn(
                'w-full text-left px-3 py-2 flex items-center gap-2 text-[13px] hover:bg-zinc-50 dark:hover:bg-zinc-900 transition last:rounded-b-xl',
                current === m.organizationId && 'bg-zinc-50 dark:bg-zinc-900',
              )}
            >
              <span className={`w-2 h-2 rounded-full bg-${colorFor(m.organizationId)}-400`} />
              <span className="flex-1">
                {m.organizationName}
                {m.isInternal && <span className="ml-1.5 text-[10px] text-zinc-400">interne</span>}
              </span>
              {current === m.organizationId && <Check className="w-3.5 h-3.5 text-zinc-500" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
