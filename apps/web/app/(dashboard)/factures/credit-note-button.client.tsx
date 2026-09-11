'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Undo2 } from 'lucide-react';
import { parseEurosToCents } from '@/features/billing/domain/quote';
import { createCreditNoteAction } from './actions';

const ERRORS: Record<string, string> = {
  forbidden: 'Droits insuffisants.',
  not_issued: 'Seule une facture émise peut faire l’objet d’un avoir.',
  is_credit_note: 'On ne fait pas d’avoir sur un avoir.',
  invalid_amount: 'Montant supérieur à ce qui reste à créditer.',
  numbering_failed: 'Numéro d’avoir non attribué, réessayez.',
};

/** Avoir total ou partiel : une facture émise ne se modifie pas, elle s'annule par avoir. */
export function CreditNoteButton({
  invoiceId,
  reference,
  creditableCents,
}: {
  invoiceId: string;
  reference: string;
  creditableCents: number;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  const run = () => {
    const max = (creditableCents / 100).toFixed(2).replace('.', ',');
    const raw = window.prompt(
      `Avoir sur la facture ${reference}.\nMontant TTC à créditer (max ${max} €) — laissez tel quel pour un avoir total :`,
      max,
    );
    if (raw == null) return;
    const cents = parseEurosToCents(raw);
    if (!cents) {
      window.alert('Montant invalide.');
      return;
    }
    const reason = window.prompt('Motif de l’avoir (visible sur le document) :', 'Annulation') ?? '';
    start(async () => {
      const res = await createCreditNoteAction({
        invoiceId,
        amountCents: cents >= creditableCents ? null : cents,
        reason,
      });
      if (!res.ok) window.alert(ERRORS[res.error] ?? `Avoir impossible (${res.error}).`);
      else router.refresh();
    });
  };

  return (
    <button
      type="button"
      onClick={run}
      disabled={pending}
      className="inline-flex items-center gap-1 text-[11px] text-zinc-500 hover:text-rose-600 dark:hover:text-rose-400 transition px-1.5 py-1 rounded-md hover:bg-zinc-50 dark:hover:bg-zinc-900 disabled:opacity-40"
      title="Émettre un avoir"
    >
      {pending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Undo2 className="w-3 h-3" />}
    </button>
  );
}
