'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { Mail, Check, Loader2, AlertCircle, FileText, BellRing } from 'lucide-react';
import { sendInvoiceByEmail, sendPaymentReminder } from './actions';
import { PaymentButton } from './payment-button.client';

type SendState =
  | { status: 'idle' }
  | { status: 'sending' }
  | { status: 'sent' }
  | { status: 'error'; message: string };

// Statuts « impayés » où une relance a du sens.
const REMINDABLE = new Set(['issued', 'overdue', 'partially_paid']);

export function InvoiceActions({
  invoiceId,
  pdfUrl,
  showPdfLink = true,
  status,
  remainingCents,
}: {
  invoiceId: string;
  pdfUrl?: string;
  showPdfLink?: boolean;
  status?: string;
  /** Reste à encaisser : affiche le bouton de règlement sur une facture émise. */
  remainingCents?: number;
}) {
  const [send, setSend] = useState<SendState>({ status: 'idle' });
  const [remind, setRemind] = useState<SendState>({ status: 'idle' });
  const [pending, startTransition] = useTransition();

  const errLabel = (error: string) =>
    error === 'no_recipient_email'
      ? 'Aucun e-mail pour le payeur (responsable entreprise, financeur ou stagiaire).'
      : error === 'numbering_failed'
      ? 'Numéro de facture non attribué, réessayez.'
      : error === 'invoice_not_found'
      ? 'Facture introuvable en base.'
      : error === 'no_api_key'
      ? 'RESEND_API_KEY non configurée.'
      : error === 'forbidden'
      ? 'Droits insuffisants.'
      : `Envoi échoué (${error}).`;

  const handleSend = () => {
    setSend({ status: 'sending' });
    startTransition(async () => {
      const result = await sendInvoiceByEmail(invoiceId);
      if (result.ok) {
        setSend({ status: 'sent' });
        setTimeout(() => setSend({ status: 'idle' }), 4000);
      } else {
        setSend({ status: 'error', message: errLabel(result.error) });
      }
    });
  };

  const handleRemind = () => {
    setRemind({ status: 'sending' });
    startTransition(async () => {
      const result = await sendPaymentReminder(invoiceId);
      if (result.ok) {
        setRemind({ status: 'sent' });
        setTimeout(() => setRemind({ status: 'idle' }), 4000);
      } else {
        setRemind({ status: 'error', message: errLabel(result.error) });
      }
    });
  };

  return (
    <div className="flex items-center gap-1.5 justify-end">
      {showPdfLink && pdfUrl && (
        <Link
          href={pdfUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-[11px] text-zinc-500 hover:text-violet-600 dark:hover:text-violet-400 transition px-1.5 py-1 rounded-md hover:bg-zinc-50 dark:hover:bg-zinc-900"
          title="Télécharger PDF"
        >
          <FileText className="w-3 h-3" />
        </Link>
      )}

      {status && REMINDABLE.has(status) && remainingCents != null && remainingCents > 0 && (
        <PaymentButton invoiceId={invoiceId} remainingCents={remainingCents} />
      )}

      {/* Relance de paiement — visible uniquement pour les factures impayées émises. */}
      {status && REMINDABLE.has(status) && (
        remind.status === 'sent' ? (
          <span className="inline-flex items-center gap-1 text-[11px] text-amber-600 dark:text-amber-400 px-1.5 py-1" title="Relance envoyée">
            <Check className="w-3 h-3" />
          </span>
        ) : remind.status === 'error' ? (
          <span className="inline-flex items-center gap-1 text-[11px] text-rose-600 dark:text-rose-400 px-1.5 py-1" title={remind.message}>
            <AlertCircle className="w-3 h-3" />
          </span>
        ) : (
          <button
            type="button"
            onClick={handleRemind}
            disabled={pending}
            className="inline-flex items-center gap-1 text-[11px] text-zinc-500 hover:text-amber-600 dark:hover:text-amber-400 transition px-1.5 py-1 rounded-md hover:bg-zinc-50 dark:hover:bg-zinc-900 disabled:opacity-40"
            title="Envoyer une relance de paiement"
          >
            {remind.status === 'sending' ? <Loader2 className="w-3 h-3 animate-spin" /> : <BellRing className="w-3 h-3" />}
          </button>
        )
      )}

      {send.status === 'sent' ? (
        <span className="inline-flex items-center gap-1 text-[11px] text-emerald-600 dark:text-emerald-400 px-2 py-1">
          <Check className="w-3 h-3" />
          Envoyé
        </span>
      ) : send.status === 'error' ? (
        <span
          className="inline-flex items-center gap-1 text-[11px] text-rose-600 dark:text-rose-400 px-2 py-1"
          title={send.message}
        >
          <AlertCircle className="w-3 h-3" />
          Erreur
        </span>
      ) : (
        <button
          type="button"
          onClick={handleSend}
          disabled={send.status === 'sending' || pending}
          className="inline-flex items-center gap-1 text-[11px] text-zinc-500 hover:text-violet-600 dark:hover:text-violet-400 transition px-1.5 py-1 rounded-md hover:bg-zinc-50 dark:hover:bg-zinc-900 disabled:opacity-40"
          title="Envoyer la facture par email"
        >
          {send.status === 'sending' ? (
            <Loader2 className="w-3 h-3 animate-spin" />
          ) : (
            <Mail className="w-3 h-3" />
          )}
        </button>
      )}
    </div>
  );
}
