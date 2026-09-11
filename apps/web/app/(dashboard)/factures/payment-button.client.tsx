'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Banknote, Loader2 } from 'lucide-react';
import { PAYMENT_METHODS, PAYMENT_METHOD_LABELS, type PaymentMethod } from '@/features/billing/domain/payments';
import { parseEurosToCents } from '@/features/billing/domain/quote';
import { recordPayment } from './actions';

const ERRORS: Record<string, string> = {
  forbidden: 'Droits insuffisants.',
  not_issued: 'Émettez d’abord la facture.',
  cancelled: 'Facture annulée.',
  invalid: 'Montant ou date invalide.',
  not_found: 'Facture introuvable.',
};

/** Encaissement d'une facture émise : acompte, solde, paiement OPCO/CPF… */
export function PaymentButton({ invoiceId, remainingCents }: { invoiceId: string; remainingCents: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [amount, setAmount] = useState((remainingCents / 100).toFixed(2).replace('.', ','));
  const [paidAt, setPaidAt] = useState(() => new Date().toISOString().slice(0, 10));
  const [method, setMethod] = useState<PaymentMethod>('virement');
  const [reference, setReference] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  const submit = () => {
    setError(null);
    const cents = parseEurosToCents(amount);
    if (!cents) return setError('Montant invalide.');
    start(async () => {
      const res = await recordPayment({ invoiceId, amountCents: cents, paidAt, method, reference: reference || undefined });
      if (!res.ok) {
        setError(ERRORS[res.error] ?? `Erreur (${res.error}).`);
        return;
      }
      setOpen(false);
      router.refresh();
    });
  };

  const field =
    'w-full rounded-md border border-zinc-200/70 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2 py-1 text-[12px] text-zinc-900 dark:text-zinc-100';

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1 text-[11px] text-zinc-500 hover:text-emerald-600 dark:hover:text-emerald-400 transition px-1.5 py-1 rounded-md hover:bg-zinc-50 dark:hover:bg-zinc-900"
        title="Enregistrer un règlement"
      >
        <Banknote className="w-3 h-3" />
      </button>
      {open && (
        <div className="absolute right-0 z-20 mt-1 w-64 rounded-lg border border-zinc-200 bg-white p-3 shadow-lg dark:border-zinc-800 dark:bg-zinc-900 space-y-2 text-left">
          <p className="text-[12px] font-medium text-zinc-900 dark:text-zinc-100">Enregistrer un règlement</p>
          <label className="block text-[11px] text-zinc-500">
            Montant (€)
            <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" className={field} />
          </label>
          <label className="block text-[11px] text-zinc-500">
            Date
            <input type="date" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} className={field} />
          </label>
          <label className="block text-[11px] text-zinc-500">
            Mode
            <select value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)} className={field}>
              {PAYMENT_METHODS.map((m) => (
                <option key={m} value={m}>
                  {PAYMENT_METHOD_LABELS[m]}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-[11px] text-zinc-500">
            Référence (optionnelle)
            <input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="N° de virement…" className={field} />
          </label>
          {error && <p className="text-[11px] text-red-600">{error}</p>}
          <button
            type="button"
            onClick={submit}
            disabled={pending}
            className="w-full inline-flex items-center justify-center gap-1.5 rounded-md bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-[12px] font-medium px-3 py-1.5"
          >
            {pending && <Loader2 className="w-3 h-3 animate-spin" />}
            Enregistrer
          </button>
        </div>
      )}
    </div>
  );
}
