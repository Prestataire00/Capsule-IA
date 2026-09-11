'use client';

import { useState, useTransition } from 'react';
import { Send, CheckCircle2, XCircle, Loader2, AlertCircle } from 'lucide-react';
import { replyToComplaint, changeComplaintStatus } from './actions';

type Status = 'open' | 'in_progress' | 'resolved' | 'closed';

export function ReplyForm({
  complaintId,
  currentStatus,
}: {
  complaintId: string;
  currentStatus: Status;
}) {
  const [message, setMessage] = useState('');
  const [byName, setByName] = useState('Formateur');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const sendReply = () => {
    setError(null);
    startTransition(async () => {
      const result = await replyToComplaint({ complaintId, message, byName });
      if (result.ok) {
        setMessage('');
      } else {
        setError(result.error);
      }
    });
  };

  const markResolved = () => {
    setError(null);
    startTransition(async () => {
      const result = await changeComplaintStatus({
        complaintId,
        newStatus: 'resolved',
        byName,
        resolution: message.trim() || undefined,
      });
      if (result.ok) {
        setMessage('');
      } else {
        setError(result.error);
      }
    });
  };

  const closeComplaint = () => {
    setError(null);
    startTransition(async () => {
      const result = await changeComplaintStatus({
        complaintId,
        newStatus: 'closed',
        byName,
      });
      if (!result.ok) setError(result.error);
    });
  };

  if (currentStatus === 'closed') {
    return (
      <div className="bg-zinc-50 dark:bg-zinc-950/40 border border-zinc-200/70 dark:border-zinc-800 rounded-xl p-5 text-center">
        <XCircle className="w-8 h-8 text-zinc-400 mx-auto mb-2" />
        <p className="text-[13px] text-zinc-500 dark:text-zinc-400">Cette réclamation est clôturée. Aucune action possible.</p>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-zinc-900 border border-zinc-200/70 dark:border-zinc-800 rounded-xl p-5 shadow-sm space-y-4">
      <p className="text-[11px] font-bold uppercase tracking-[0.06em] text-zinc-500 dark:text-zinc-400">Répondre</p>

      <div>
        <label className="text-[12px] font-semibold text-zinc-700 dark:text-zinc-300 block mb-1.5">
          Votre nom (apparaît dans le suivi de l&apos;apprenant)
        </label>
        <input
          type="text"
          value={byName}
          onChange={(e) => setByName(e.target.value)}
          placeholder="Marie Durand, Référent qualité…"
          className="w-full h-9 bg-white dark:bg-zinc-950 border border-zinc-200/80 dark:border-zinc-800 rounded-lg px-3 text-[13px] focus:outline-none focus:border-orange-300 dark:focus:border-orange-800 focus:ring-4 focus:ring-orange-500/10 transition"
        />
      </div>

      <div>
        <label className="text-[12px] font-semibold text-zinc-700 dark:text-zinc-300 block mb-1.5">
          Message à l&apos;apprenant
        </label>
        <textarea
          rows={5}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Bonjour, nous avons bien reçu votre signalement. Voici la suite que nous proposons…"
          className="w-full bg-white dark:bg-zinc-950 border border-zinc-200/80 dark:border-zinc-800 rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:border-orange-300 dark:focus:border-orange-800 focus:ring-4 focus:ring-orange-500/10 placeholder:text-zinc-400 transition resize-y"
        />
        <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-1">
          Si tu marques comme &ldquo;Résolue&rdquo;, ce message sera utilisé comme texte de résolution.
        </p>
      </div>

      {error && (
        <div className="flex items-start gap-2 p-3 bg-red-50 dark:bg-red-950/30 border border-red-200/60 dark:border-red-900/40 rounded-lg">
          <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
          <p className="text-[12px] text-red-900 dark:text-red-200">{error}</p>
        </div>
      )}

      <div className="flex flex-wrap gap-2 pt-2 border-t border-zinc-100 dark:border-zinc-800">
        <button
          type="button"
          onClick={sendReply}
          disabled={pending || message.trim().length < 2 || byName.trim().length < 1}
          className="bg-orange-500 hover:bg-orange-600 text-white text-[13px] font-semibold px-4 h-10 rounded-lg transition shadow-sm shadow-orange-600/30 ring-1 ring-inset ring-white/10 inline-flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {pending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
          Envoyer la réponse
        </button>

        {currentStatus !== 'resolved' && (
          <button
            type="button"
            onClick={markResolved}
            disabled={pending || byName.trim().length < 1}
            className="border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50 dark:bg-emerald-950/40 hover:bg-emerald-100 dark:hover:bg-emerald-950/70 text-emerald-700 dark:text-emerald-300 text-[13px] font-semibold px-4 h-10 rounded-lg transition inline-flex items-center gap-2 disabled:opacity-40"
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            Marquer résolue
          </button>
        )}

        {currentStatus === 'resolved' && (
          <button
            type="button"
            onClick={closeComplaint}
            disabled={pending || byName.trim().length < 1}
            className="bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-200 text-[13px] font-semibold px-4 h-10 rounded-lg transition inline-flex items-center gap-2 disabled:opacity-40"
          >
            <XCircle className="w-3.5 h-3.5" />
            Clôturer définitivement
          </button>
        )}
      </div>
    </div>
  );
}
