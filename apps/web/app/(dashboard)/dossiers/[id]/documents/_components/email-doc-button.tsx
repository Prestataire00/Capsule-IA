'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAction } from 'next-safe-action/hooks';
import { Mail, Loader2, Check } from 'lucide-react';
import { emailDocument } from '../email-actions';

export function EmailDocButton({
  documentId,
  defaultEmail,
}: {
  documentId: string;
  defaultEmail: string;
}) {
  const router = useRouter();
  const { executeAsync } = useAction(emailDocument);
  const [open, setOpen] = useState(false);
  const [to, setTo] = useState(defaultEmail);
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');

  async function send() {
    if (!to.trim()) return;
    setState('sending');
    const res = await executeAsync({ documentId, to: to.trim() });
    if (res?.data?.ok) {
      setState('sent');
      router.refresh();
      setTimeout(() => setOpen(false), 1500);
    } else {
      setState('error');
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="h-8 px-2 rounded-md inline-flex items-center gap-1.5 text-[12px] font-semibold text-zinc-500 dark:text-zinc-400 hover:bg-orange-50 hover:text-orange-600 dark:hover:bg-orange-950/40 dark:hover:text-orange-300 transition"
        title="Envoyer par email"
      >
        <Mail className="w-4 h-4" />
        Email
      </button>
    );
  }

  return (
    <span className="inline-flex items-center gap-1">
      <input
        value={to}
        onChange={(e) => setTo(e.target.value)}
        placeholder="email@exemple.com"
        type="email"
        className="h-8 bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800 rounded-lg px-2.5 text-[12px] w-48 transition focus:outline-none focus:border-orange-300 dark:focus:border-orange-800 focus:ring-4 focus:ring-orange-500/10 placeholder:text-zinc-400"
      />
      <button
        type="button"
        onClick={send}
        disabled={state === 'sending'}
        className="w-8 h-8 rounded-md grid place-items-center text-orange-600 hover:bg-orange-50 dark:text-orange-400 dark:hover:bg-orange-950/40 disabled:opacity-40 transition"
        title="Envoyer"
      >
        {state === 'sending' ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
        ) : state === 'sent' ? (
          <Check className="w-3.5 h-3.5 text-emerald-600" />
        ) : (
          <Mail className="w-4 h-4" />
        )}
      </button>
      {state === 'error' && <span className="text-[11px] text-red-600 dark:text-red-400">échec</span>}
    </span>
  );
}
