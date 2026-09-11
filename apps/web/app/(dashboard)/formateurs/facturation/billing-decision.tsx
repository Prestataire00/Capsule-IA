'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Loader2, Wallet, X } from 'lucide-react';
import { decideTrainerExpense, decideTrainerInvoice, markTrainerExpenseReimbursed, markTrainerInvoicePaid } from './actions';

/** Décision de l'organisme sur une facture ou une note de frais d'un formateur. */
export function BillingDecision({ kind, id, status }: { kind: 'facture' | 'frais'; id: string; status: string }) {
  const router = useRouter();
  const [refus, setRefus] = useState(false);
  const [motif, setMotif] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const executer = (fn: () => Promise<{ ok: true } | { ok: false; error: string }>) =>
    start(async () => {
      setErreur(null);
      const r = await fn();
      if (r.ok) {
        setRefus(false);
        router.refresh();
      } else setErreur(r.error);
    });

  const bouton = 'inline-flex items-center gap-1 text-[12px] font-medium px-2.5 py-1.5 rounded-md disabled:opacity-40';

  if (status === 'soumise') {
    return (
      <div className="space-y-2">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={pending}
            onClick={() => executer(() => (kind === 'facture' ? decideTrainerInvoice({ id, decision: 'validee' }) : decideTrainerExpense({ id, decision: 'validee' })))}
            className={`${bouton} bg-emerald-600 text-white hover:bg-emerald-700`}
          >
            {pending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />} Valider
          </button>
          <button type="button" disabled={pending} onClick={() => setRefus((v) => !v)} className={`${bouton} border border-zinc-200 dark:border-zinc-700 text-red-700 dark:text-red-400`}>
            <X className="w-3.5 h-3.5" /> Refuser
          </button>
        </div>
        {refus && (
          <div className="flex gap-2">
            <input
              value={motif}
              onChange={(e) => setMotif(e.target.value)}
              maxLength={500}
              placeholder="Motif du refus (transmis au formateur)"
              className="flex-1 text-[12px] px-2.5 py-1.5 rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900"
            />
            <button
              type="button"
              disabled={pending || !motif.trim()}
              onClick={() =>
                executer(() =>
                  kind === 'facture' ? decideTrainerInvoice({ id, decision: 'refusee', note: motif }) : decideTrainerExpense({ id, decision: 'refusee', note: motif }),
                )
              }
              className={`${bouton} bg-red-600 text-white hover:bg-red-700`}
            >
              Confirmer le refus
            </button>
          </div>
        )}
        {erreur && <p role="alert" className="text-[12px] text-red-700 dark:text-red-300">{erreur}</p>}
      </div>
    );
  }

  if (status === 'validee') {
    return (
      <div className="space-y-1">
        <button
          type="button"
          disabled={pending}
          onClick={() => executer(() => (kind === 'facture' ? markTrainerInvoicePaid({ id }) : markTrainerExpenseReimbursed({ id })))}
          className={`${bouton} border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800`}
        >
          {pending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wallet className="w-3.5 h-3.5" />}
          {kind === 'facture' ? 'Marquer payée' : 'Marquer remboursée'}
        </button>
        {erreur && <p role="alert" className="text-[12px] text-red-700 dark:text-red-300">{erreur}</p>}
      </div>
    );
  }
  return null;
}
