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
        className="text-[12px] text-zinc-500 hover:text-violet-600 dark:hover:text-violet-400 inline-flex items-center gap-1"
        title="Envoyer par email"
      >
        <Mail className="w-3 h-3" />
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
        className="bg-zinc-50 dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded px-2 py-1 text-[12px] w-44"
      />
      <button
        type="button"
        onClick={send}
        disabled={state === 'sending'}
        className="text-violet-600 hover:text-violet-700 disabled:opacity-40"
        title="Envoyer"
      >
        {state === 'sending' ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
        ) : state === 'sent' ? (
          <Check className="w-3.5 h-3.5 text-emerald-600" />
        ) : (
          <Mail className="w-3.5 h-3.5" />
        )}
      </button>
      {state === 'error' && <span className="text-[11px] text-red-600">échec</span>}
    </span>
  );
}
