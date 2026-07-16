'use client';

import { useState, useTransition, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronDown, Check, Loader2 } from 'lucide-react';
import { StatusPill } from '@/shared/ui/status-pill';
import { setInvoiceStatus, type InvoiceStatusValue } from './actions';

type Tone = 'neutral' | 'warning' | 'success' | 'danger' | 'info';

const LABEL: Record<InvoiceStatusValue, string> = {
  draft: 'brouillon',
  issued: 'émise',
  paid: 'payée',
  partially_paid: 'partielle',
  overdue: 'en retard',
  cancelled: 'annulée',
};
const TONE: Record<InvoiceStatusValue, Tone> = {
  draft: 'neutral',
  issued: 'info',
  paid: 'success',
  partially_paid: 'warning',
  overdue: 'danger',
  cancelled: 'neutral',
};

// Ordre proposé dans le menu (statuts « métier » usuels en tête).
const CHOICES: InvoiceStatusValue[] = ['issued', 'paid', 'overdue', 'partially_paid', 'draft', 'cancelled'];

export function InvoiceStatusControl({
  invoiceId,
  status,
}: {
  invoiceId: string;
  status: InvoiceStatusValue;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  const choose = (next: InvoiceStatusValue) => {
    setOpen(false);
    if (next === status) return;
    startTransition(async () => {
      const res = await setInvoiceStatus(invoiceId, next);
      if (res.ok) router.refresh();
    });
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={pending}
        className="inline-flex items-center gap-1 rounded-full transition hover:opacity-80 disabled:opacity-50"
        title="Modifier le statut"
      >
        <StatusPill tone={TONE[status]}>{LABEL[status]}</StatusPill>
        {pending ? <Loader2 className="w-3 h-3 animate-spin text-zinc-400" /> : <ChevronDown className="w-3 h-3 text-zinc-400" />}
      </button>

      {open && (
        <div className="absolute right-0 z-20 mt-1 w-44 rounded-lg border border-zinc-200 bg-white py-1 shadow-lg dark:border-zinc-800 dark:bg-zinc-900">
          {CHOICES.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => choose(s)}
              className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-[12px] text-zinc-700 hover:bg-zinc-50 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              <StatusPill tone={TONE[s]}>{LABEL[s]}</StatusPill>
              {s === status && <Check className="w-3 h-3 text-violet-600" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
