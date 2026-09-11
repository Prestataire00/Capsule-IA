'use client';

import { useState, useTransition } from 'react';
import { Plus, Trash2, Loader2, Wallet } from 'lucide-react';
import { addDossierExpense, deleteDossierExpense } from './actions';
import { inputClass } from '@/shared/ui/form-field';

export type ExpenseRow = {
  id: string;
  kind: string;
  label: string | null;
  amount_cents: number;
  hours: number | null;
  supplier_name: string | null;
  incurred_on: string | null;
};

const KIND_LABEL: Record<string, string> = {
  salaire_formateur: 'Rémunération formateur',
  achat_formation: 'Achat de prestation de formation',
  sous_traitance_confiee: "Sous-traitance confiée à un autre OF",
  autre: 'Autre charge',
};

const KIND_OPTIONS = Object.entries(KIND_LABEL).map(([value, label]) => ({ value, label }));

function eur(cents: number): string {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(cents / 100);
}

export function ExpensesManager({ dossierId, initial }: { dossierId: string; initial: ExpenseRow[] }) {
  const [rows, setRows] = useState<ExpenseRow[]>(initial);
  const [kind, setKind] = useState('salaire_formateur');
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const total = rows.reduce((s, r) => s + r.amount_cents, 0);

  const onAdd = (formData: FormData) => {
    setError(null);
    startTransition(async () => {
      const res = await addDossierExpense(formData);
      if (!res.ok) setError(res.error);
    });
  };

  const onDelete = (id: string) => {
    setError(null);
    setRows((r) => r.filter((x) => x.id !== id)); // optimiste
    startTransition(async () => {
      const res = await deleteDossierExpense(dossierId, id);
      if (!res.ok) setError(res.error);
    });
  };

  return (
    <div className="space-y-4">
      {/* Formulaire d'ajout */}
      <form action={onAdd} className="bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-xl p-4">
        <input type="hidden" name="dossierId" value={dossierId} />
        <div className="flex items-center gap-2 mb-3">
          <Wallet className="w-3.5 h-3.5 text-zinc-400" />
          <p className="text-[11px] uppercase tracking-wider text-zinc-500">Ajouter une dépense</p>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <label className="block col-span-2 md:col-span-1">
            <span className="text-[12px] font-medium text-zinc-700 dark:text-zinc-300 block mb-1.5">Nature</span>
            <select name="kind" value={kind} onChange={(e) => setKind(e.target.value)} className={inputClass}>
              {KIND_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-[12px] font-medium text-zinc-700 dark:text-zinc-300 block mb-1.5">Montant (€ HT)</span>
            <input name="amount" inputMode="decimal" placeholder="0,00" className={inputClass} />
          </label>
          <label className="block">
            <span className="text-[12px] font-medium text-zinc-700 dark:text-zinc-300 block mb-1.5">Date</span>
            <input name="incurredOn" type="date" className={inputClass} />
          </label>
          {kind === 'sous_traitance_confiee' && (
            <label className="block">
              <span className="text-[12px] font-medium text-zinc-700 dark:text-zinc-300 block mb-1.5">Heures confiées</span>
              <input name="hours" inputMode="decimal" placeholder="0" className={inputClass} />
            </label>
          )}
          <label className="block">
            <span className="text-[12px] font-medium text-zinc-700 dark:text-zinc-300 block mb-1.5">Prestataire</span>
            <input name="supplierName" placeholder="Nom (facultatif)" className={inputClass} />
          </label>
          <label className="block col-span-2 md:col-span-1">
            <span className="text-[12px] font-medium text-zinc-700 dark:text-zinc-300 block mb-1.5">Libellé</span>
            <input name="label" placeholder="Description (facultatif)" className={inputClass} />
          </label>
        </div>
        <div className="flex items-center gap-3 mt-3">
          <button
            type="submit"
            disabled={pending}
            className="inline-flex items-center gap-1.5 bg-violet-600 hover:bg-violet-700 text-white text-[13px] font-medium px-4 py-2 rounded-lg transition shadow-sm disabled:opacity-50"
          >
            {pending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
            Ajouter
          </button>
          {error && <span className="text-[12px] text-red-600 dark:text-red-400">Erreur : {error}</span>}
        </div>
      </form>

      {/* Liste */}
      <div className="border border-zinc-200/60 dark:border-zinc-800 rounded-xl overflow-hidden">
        <div className="px-4 py-2.5 bg-zinc-50/60 dark:bg-zinc-900/40 text-[11px] tracking-wider uppercase text-zinc-500 grid grid-cols-[1fr_120px_90px_40px] gap-3">
          <span>Nature / prestataire</span>
          <span className="text-right">Montant HT</span>
          <span className="text-right">Date</span>
          <span />
        </div>
        {rows.length === 0 ? (
          <p className="text-[13px] text-zinc-500 dark:text-zinc-400 text-center py-8">Aucune dépense enregistrée.</p>
        ) : (
          <ul className="divide-y divide-zinc-200/60 dark:divide-zinc-800">
            {rows.map((r) => (
              <li key={r.id} className="px-4 py-3 grid grid-cols-[1fr_120px_90px_40px] gap-3 items-center text-[13px]">
                <div className="min-w-0">
                  <p className="font-medium text-zinc-800 dark:text-zinc-200 truncate">
                    {KIND_LABEL[r.kind] ?? r.kind}
                    {r.hours != null && r.hours > 0 && <span className="text-zinc-400 font-normal"> · {r.hours} h</span>}
                  </p>
                  <p className="text-[11px] text-zinc-500 truncate">
                    {[r.supplier_name, r.label].filter(Boolean).join(' · ') || '—'}
                  </p>
                </div>
                <span className="text-right tabular-nums text-zinc-900 dark:text-zinc-100">{eur(r.amount_cents)}</span>
                <span className="text-right text-[12px] text-zinc-500">
                  {r.incurred_on ? new Date(r.incurred_on).toLocaleDateString('fr-FR') : '—'}
                </span>
                <button
                  type="button"
                  onClick={() => onDelete(r.id)}
                  disabled={pending}
                  aria-label="Supprimer"
                  className="justify-self-end text-zinc-400 hover:text-red-600 dark:hover:text-red-400 disabled:opacity-50 transition"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </li>
            ))}
            <li className="px-4 py-3 grid grid-cols-[1fr_120px_90px_40px] gap-3 items-center text-[13px] bg-zinc-50/60 dark:bg-zinc-950/40 font-semibold">
              <span>Total des charges du dossier</span>
              <span className="text-right tabular-nums text-violet-700 dark:text-violet-400">{eur(total)}</span>
              <span />
              <span />
            </li>
          </ul>
        )}
      </div>
    </div>
  );
}
