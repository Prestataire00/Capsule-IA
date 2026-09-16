'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Loader2 } from 'lucide-react';
import { marquerMesNotificationsLues } from './actions';

/** Vider la pastille d'un geste, quand on a déjà tout lu ailleurs. */
export function MarquerToutLu() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      onClick={() =>
        startTransition(async () => {
          await marquerMesNotificationsLues();
          router.refresh();
        })
      }
      disabled={pending}
      className="h-9 px-3 rounded-lg text-[13px] font-medium inline-flex items-center gap-1.5 border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 bg-white dark:bg-zinc-900 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition disabled:opacity-60"
    >
      {pending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
      Tout marquer lu
    </button>
  );
}
