'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAction } from 'next-safe-action/hooks';
import { FileText, Loader2, Check } from 'lucide-react';
import { generateConventions } from '../convention-actions';

export function GenerateConventionsButton({ dossierId }: { dossierId: string }) {
  const router = useRouter();
  const { executeAsync } = useAction(generateConventions);
  const [state, setState] = useState<'idle' | 'running' | 'done' | 'error'>('idle');
  const [count, setCount] = useState(0);

  async function run() {
    setState('running');
    const res = await executeAsync({ dossierId });
    if (res?.data?.ok) {
      setCount(res.data.count);
      setState('done');
      router.refresh();
      setTimeout(() => setState('idle'), 2500);
    } else {
      setState('error');
    }
  }

  return (
    <button
      type="button"
      onClick={run}
      disabled={state === 'running'}
      className="group flex items-center gap-3 bg-white dark:bg-zinc-900 border border-zinc-200/70 dark:border-zinc-800 rounded-xl shadow-sm px-4 h-11 hover:border-orange-300 dark:hover:border-orange-800 transition disabled:opacity-50 text-left"
    >
      {state === 'running' ? (
        <Loader2 className="w-4 h-4 text-zinc-400 flex-shrink-0 animate-spin" />
      ) : state === 'done' ? (
        <Check className="w-4 h-4 text-emerald-600 flex-shrink-0" />
      ) : (
        <FileText className="w-4 h-4 text-zinc-400 dark:text-zinc-500 flex-shrink-0" />
      )}
      <span className="text-[13px] font-semibold text-zinc-900 dark:text-zinc-100 flex-1 truncate tabular-nums">
        {state === 'done' ? `${count} convention(s) générée(s)` : 'Générer les conventions'}
      </span>
      {state === 'error' && <span className="text-[11px] text-red-600 dark:text-red-400">échec</span>}
    </button>
  );
}
