'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Ban, CheckCircle2, Eye, Loader2, Percent, Receipt, RotateCcw, Send, XCircle } from 'lucide-react';
import type { QuoteStatus } from '@/features/billing/domain/quote';
import { canSendQuote } from '@/features/billing/domain/quote';
import { changeQuoteStatus, invoiceDeposit, invoiceFromQuote, sendQuote } from '../actions';
import { actionError } from './labels';

type Props = {
  quoteId: string;
  reference: string;
  status: QuoteStatus;
  recipientEmail: string | null;
  documentId: string | null;
  invoice: { id: string; reference: string; status: string } | null;
  canManage: boolean;
  clientKind: 'company' | 'individual';
};

const btn =
  'w-full inline-flex items-center gap-2 rounded-lg border border-zinc-200/70 dark:border-zinc-700 px-3 py-2 text-[13px] text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 disabled:opacity-50 transition';

/** Colonne d'actions de la fiche devis : envoi, statuts manuels, facture. */
export function QuoteSideActions(p: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null);

  const run = (confirmText: string | null, action: () => Promise<unknown>, okText: string) => {
    if (confirmText && !window.confirm(confirmText)) return;
    setMessage(null);
    start(async () => {
      const res = await action();
      const e = actionError(res);
      if (e) setMessage({ tone: 'err', text: e });
      else {
        setMessage({ tone: 'ok', text: okText });
        router.refresh();
      }
    });
  };

  const setStatus = (status: 'signed' | 'refused' | 'cancelled' | 'draft', confirmText: string, okText: string) =>
    run(confirmText, () => changeQuoteStatus({ quoteId: p.quoteId, status }), okText);

  return (
    <div className="space-y-2">
      {p.documentId && (
        <Link href={`/documents/${p.documentId}/apercu`} className={btn}>
          <Eye className="w-3.5 h-3.5" /> Aperçu du devis
        </Link>
      )}

      {p.canManage && p.status !== 'draft' && canSendQuote(p.status) && (
        <button
          type="button"
          disabled={pending}
          className={btn}
          onClick={() =>
            p.recipientEmail
              ? run(
                  `Renvoyer le lien de signature du devis ${p.reference} à ${p.recipientEmail} ?`,
                  () => sendQuote({ quoteId: p.quoteId }),
                  `Lien renvoyé à ${p.recipientEmail}.`,
                )
              : setMessage({ tone: 'err', text: 'Aucun e-mail de destinataire.' })
          }
        >
          <Send className="w-3.5 h-3.5" /> Renvoyer au client
        </button>
      )}

      {p.canManage && (p.status === 'draft' || p.status === 'sent') && (
        <button
          type="button"
          disabled={pending}
          className={btn}
          onClick={() =>
            setStatus(
              'signed',
              `Marquer le devis ${p.reference} comme signé (accord reçu hors plateforme) ? La facture brouillon sera créée.`,
              'Devis signé — facture brouillon créée.',
            )
          }
        >
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> Marquer comme signé
        </button>
      )}

      {p.canManage && p.status === 'sent' && (
        <button
          type="button"
          disabled={pending}
          className={btn}
          onClick={() => setStatus('refused', `Le client a refusé le devis ${p.reference} ?`, 'Devis marqué refusé.')}
        >
          <XCircle className="w-3.5 h-3.5 text-red-600" /> Marquer comme refusé
        </button>
      )}

      {p.canManage && (p.status === 'sent' || p.status === 'expired') && (
        <button
          type="button"
          disabled={pending}
          className={btn}
          onClick={() =>
            setStatus(
              'draft',
              'Remettre le devis en brouillon pour le modifier ? Le lien de signature envoyé sera désactivé.',
              'Devis repassé en brouillon.',
            )
          }
        >
          <RotateCcw className="w-3.5 h-3.5" /> Remettre en brouillon
        </button>
      )}

      {p.canManage && p.status === 'signed' && !p.invoice && (
        <button
          type="button"
          disabled={pending}
          className={btn}
          onClick={() => run(null, () => invoiceFromQuote({ quoteId: p.quoteId }), 'Facture brouillon créée.')}
        >
          <Receipt className="w-3.5 h-3.5" /> Créer la facture
        </button>
      )}

      {p.canManage && p.status === 'signed' && (
        <button
          type="button"
          disabled={pending}
          className={btn}
          onClick={() => {
            const cap = p.clientKind === 'individual' ? 30 : 99;
            const raw = window.prompt(
              `Pourcentage d'acompte${p.clientKind === 'individual' ? ' (particulier : 30 % max, art. L.6353-6)' : ''} :`,
              '30',
            );
            if (raw == null) return;
            const percent = Number.parseFloat(raw.replace(',', '.'));
            if (!(percent > 0 && percent <= cap)) {
              setMessage({ tone: 'err', text: `Pourcentage invalide (1 à ${cap} %).` });
              return;
            }
            run(null, () => invoiceDeposit({ quoteId: p.quoteId, percent }), `Facture d'acompte de ${percent} % créée — la facture de solde est recalculée.`);
          }}
        >
          <Percent className="w-3.5 h-3.5" /> Facture d’acompte
        </button>
      )}

      {p.invoice && (
        <Link href="/factures" className={btn}>
          <Receipt className="w-3.5 h-3.5 text-emerald-600" />
          Facture {p.invoice.reference.startsWith('PROV-') ? 'brouillon' : p.invoice.reference}
        </Link>
      )}

      {p.canManage && ['draft', 'sent', 'expired', 'refused'].includes(p.status) && (
        <button
          type="button"
          disabled={pending}
          className={`${btn} text-zinc-500`}
          onClick={() =>
            setStatus('cancelled', `Annuler définitivement le devis ${p.reference} ?`, 'Devis annulé.')
          }
        >
          <Ban className="w-3.5 h-3.5" /> Annuler le devis
        </button>
      )}

      {pending && (
        <p className="text-[12px] text-zinc-500 inline-flex items-center gap-1.5">
          <Loader2 className="w-3 h-3 animate-spin" /> En cours…
        </p>
      )}
      {message && (
        <p className={`text-[12px] ${message.tone === 'ok' ? 'text-emerald-600' : 'text-red-600'}`}>{message.text}</p>
      )}
    </div>
  );
}
