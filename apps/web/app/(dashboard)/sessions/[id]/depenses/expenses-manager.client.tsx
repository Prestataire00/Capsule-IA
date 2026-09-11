'use client';

import { useState } from 'react';
import { useAction } from 'next-safe-action/hooks';
import { Loader2, Plus, Trash2 } from 'lucide-react';
import { FormField, inputClass } from '@/shared/ui/form-field';
import { Button } from '@/shared/ui/button';
import { addSessionExpense, deleteSessionExpense } from './expense-actions';

export type ExpenseRow = {
  id: string;
  kind: string;
  label: string;
  amount_cents: number;
  supplier_name: string | null;
  hours: number | null;
  incurred_on: string | null;
};

const KINDS: { value: string; label: string }[] = [
  { value: 'salaire_formateur', label: 'Rémunération formateur' },
  { value: 'sous_traitance_confiee', label: 'Sous-traitance' },
  { value: 'achat_formation', label: 'Achat de formation' },
  { value: 'autre', label: 'Autre' },
];
const kindLabel = (k: string) => KINDS.find((x) => x.value === k)?.label ?? k;
const euros = (c: number) => `${(c / 100).toLocaleString('fr-FR', { minimumFractionDigits: 0 })} €`;

export function ExpensesManager({ sessionId, expenses }: { sessionId: string; expenses: ExpenseRow[] }) {
  const [kind, setKind] = useState('salaire_formateur');
  const [label, setLabel] = useState('');
  const [amount, setAmount] = useState('');
  const [supplier, setSupplier] = useState('');

  const add = useAction(addSessionExpense);
  const del = useAction(deleteSessionExpense);

  const total = expenses.reduce((a, e) => a + (e.amount_cents ?? 0), 0);
  const res = add.result?.data;
  const err = res && !res.ok ? res.error : add.result?.serverError ? 'Erreur serveur.' : null;

  const submit = () => {
    const amt = Number(amount.replace(',', '.'));
    if (!label.trim() || !Number.isFinite(amt)) return;
    add.execute({
      sessionId,
      kind: kind as 'salaire_formateur' | 'achat_formation' | 'sous_traitance_confiee' | 'autre',
      label: label.trim(),
      amountEuros: amt,
      supplierName: supplier || undefined,
    });
    setLabel('');
    setAmount('');
    setSupplier('');
  };

  return (
    <div className="space-y-6">
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200/70 dark:border-zinc-800 rounded-xl shadow-sm p-5">
        <h2 className="text-[15px] font-bold text-zinc-900 dark:text-zinc-100 mb-4">Ajouter une dépense</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormField label="Type">
            <select className={inputClass} value={kind} onChange={(e) => setKind(e.target.value)}>
              {KINDS.map((k) => (
                <option key={k.value} value={k.value}>{k.label}</option>
              ))}
            </select>
          </FormField>
          <FormField label="Libellé">
            <input className={inputClass} value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Ex. Journée formateur" />
          </FormField>
          <FormField label="Montant (€)">
            <input className={inputClass} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" />
          </FormField>
          <FormField label="Fournisseur / bénéficiaire (facultatif)">
            <input className={inputClass} value={supplier} onChange={(e) => setSupplier(e.target.value)} placeholder="Ex. nom du formateur" />
          </FormField>
        </div>
        <div className="mt-4 flex items-center gap-3">
          <Button type="button" variant="brand" onClick={submit} disabled={add.isExecuting || !label.trim() || !amount}>
            {add.isExecuting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Ajouter
          </Button>
          {err && <span className="text-[13px] text-rose-600 dark:text-rose-400">{err}</span>}
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-[15px] font-bold text-zinc-900 dark:text-zinc-100">Dépenses de la session</h2>
          <span className="text-[13px] font-bold text-zinc-900 dark:text-zinc-100 tabular-nums">Total : {euros(total)}</span>
        </div>
        {expenses.length === 0 ? (
          <p className="text-[13px] text-zinc-500 dark:text-zinc-400">Aucune dépense enregistrée pour cette session.</p>
        ) : (
          <ul className="bg-white dark:bg-zinc-900 border border-zinc-200/70 dark:border-zinc-800 rounded-xl shadow-sm divide-y divide-zinc-100 dark:divide-zinc-800/80 text-[13px]">
            {expenses.map((e) => (
              <li key={e.id} className="flex items-center justify-between gap-3 px-5 py-3.5 hover:bg-zinc-50/80 dark:hover:bg-zinc-800/30 transition-colors">
                <div className="min-w-0">
                  <p className="font-bold text-zinc-900 dark:text-zinc-100">{e.label}</p>
                  <p className="text-[12px] text-zinc-500 dark:text-zinc-400">
                    {kindLabel(e.kind)}
                    {e.supplier_name ? ` · ${e.supplier_name}` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="font-bold text-zinc-900 dark:text-zinc-100 tabular-nums">{euros(e.amount_cents ?? 0)}</span>
                  <button
                    type="button"
                    onClick={() => del.execute({ sessionId, id: e.id })}
                    className="w-8 h-8 rounded-md grid place-items-center text-zinc-500 dark:text-zinc-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/40 dark:hover:text-rose-400 transition"
                    title="Supprimer"
                    aria-label={`Supprimer — ${e.label}`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
