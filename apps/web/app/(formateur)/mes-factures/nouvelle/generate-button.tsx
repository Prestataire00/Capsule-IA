'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Send } from 'lucide-react';
import { createGeneratedInvoice } from '../actions';

const ERREURS: Record<string, string> = {
  profile_incomplete: 'Complétez votre profil de facturation.',
  nothing_to_invoice: 'Aucune séance à facturer.',
  forbidden: 'Vous n’êtes pas formateur actif de cet organisme.',
  numbering_failed: 'Le numéro de facture n’a pas pu être attribué. Réessayez.',
  pdf_failed: 'Le PDF n’a pas pu être généré. Réessayez.',
};

export function GenerateInvoiceButton({ organizationId, disabled }: { organizationId: string; disabled: boolean }) {
  const router = useRouter();
  const [notes, setNotes] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="space-y-3">
      <label className="block space-y-1">
        <span className="text-[12px] font-medium text-zinc-700 dark:text-zinc-300">Note sur la facture (facultatif)</span>
        <input
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          maxLength={1000}
          className="w-full text-[13px] px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900"
          placeholder="Ex. référence de commande"
        />
      </label>
      {erreur && <p role="alert" className="text-[13px] text-red-700 dark:text-red-300">{erreur}</p>}
      <button
        type="button"
        disabled={disabled || pending}
        onClick={() =>
          start(async () => {
            setErreur(null);
            const r = await createGeneratedInvoice({ organizationId, notes });
            if (r.ok) router.push('/mes-factures');
            else setErreur(ERREURS[r.error] ?? 'La facture n’a pas pu être créée. Réessayez.');
          })
        }
        className="inline-flex items-center gap-1.5 bg-orange-500 hover:bg-orange-600 text-white text-[13px] font-medium px-4 py-2 rounded-lg shadow-sm disabled:opacity-40"
      >
        {pending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
        Générer et envoyer la facture
      </button>
      <p className="text-[11px] text-zinc-500">La facture est numérotée, mise en PDF et transmise à l’organisme, qui la valide avant paiement.</p>
    </div>
  );
}
