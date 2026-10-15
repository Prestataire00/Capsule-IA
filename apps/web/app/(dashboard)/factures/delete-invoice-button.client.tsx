'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Trash2 } from 'lucide-react';
import { deleteInvoice } from './actions';

const ERRORS: Record<string, string> = {
  forbidden: 'Réservé au propriétaire et aux administrateurs.',
  not_found: 'Facture introuvable.',
  confirmation_requise: 'Suppression annulée : le numéro n’a pas été saisi.',
  confirmation_incorrecte: 'Le numéro saisi ne correspond pas : rien n’a été supprimé.',
};

/**
 * Supprimer une facture de test. Un brouillon : simple confirmation. Une
 * facture émise : on retape son numéro, car elle laisse un trou dans la
 * numérotation (une vraie facture s'annule par avoir).
 */
export function DeleteInvoiceButton({ invoiceId, reference, status }: { invoiceId: string; reference: string; status: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const brouillon = status === 'draft' && reference.startsWith('PROV-');

  const run = () => {
    let confirmation: string | null = null;
    if (brouillon) {
      if (!window.confirm('Supprimer ce brouillon de facture ?')) return;
    } else {
      confirmation = window.prompt(
        `Supprimer la facture ${reference} ?\n\n` +
          'À réserver aux données de test : une vraie facture émise s’annule par un avoir, sa suppression crée un trou dans la numérotation. ' +
          'Ses avoirs et son PDF archivé sont retirés avec elle.\n\n' +
          `Pour confirmer, tapez son numéro (${reference}) :`,
      );
      if (confirmation == null) return;
    }
    start(async () => {
      const res = await deleteInvoice(invoiceId, confirmation);
      if (!res.ok) window.alert(ERRORS[res.error] ?? `Suppression impossible (${res.error}).`);
      else router.refresh();
    });
  };

  return (
    <button
      type="button"
      onClick={run}
      disabled={pending}
      className="inline-flex items-center gap-1 text-[11px] text-zinc-500 hover:text-red-600 dark:hover:text-red-400 transition px-1.5 py-1 rounded-md hover:bg-zinc-50 dark:hover:bg-zinc-900 disabled:opacity-40"
      title="Supprimer la facture"
      aria-label={`Supprimer la facture ${reference}`}
    >
      {pending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
    </button>
  );
}
