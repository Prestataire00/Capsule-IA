'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { Mail, Check, Loader2, AlertCircle, FileText } from 'lucide-react';
import { sendInvoiceByEmail } from './actions';

type SendState =
  | { status: 'idle' }
  | { status: 'sending' }
  | { status: 'sent' }
  | { status: 'error'; message: string };

export function InvoiceActions({
  invoiceId,
  pdfUrl,
  showPdfLink = true,
}: {
  invoiceId: string;
  pdfUrl?: string;
  showPdfLink?: boolean;
}) {
  const [send, setSend] = useState<SendState>({ status: 'idle' });
  const [pending, startTransition] = useTransition();

  const handleSend = () => {
    setSend({ status: 'sending' });
    startTransition(async () => {
      const result = await sendInvoiceByEmail(invoiceId);
      if (result.ok) {
        setSend({ status: 'sent' });
        // Reset au bout de 4s pour permettre un renvoi si besoin
        setTimeout(() => setSend({ status: 'idle' }), 4000);
      } else {
        const msg =
          result.error === 'no_recipient_email'
            ? 'Aucun email destinataire (entreprise ni apprenant).'
            : result.error === 'invoice_not_found'
            ? 'Facture introuvable en base.'
            : result.error === 'no_api_key'
            ? 'RESEND_API_KEY non configurée.'
            : `Envoi échoué (${result.error}).`;
        setSend({ status: 'error', message: msg });
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
