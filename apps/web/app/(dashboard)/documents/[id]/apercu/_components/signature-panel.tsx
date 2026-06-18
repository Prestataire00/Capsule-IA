'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAction } from 'next-safe-action/hooks';
import { Loader2, Plus, Send, Trash2, CheckCircle2, Clock, XCircle } from 'lucide-react';
import { requestSignatures } from '../signature-actions';
import { SIGNER_KINDS, SIGNER_KIND_LABELS, type SignerKind } from '../signature-schema';

export type ExistingSignature = {
  signerName: string | null;
  signerEmail: string | null;
  signerKind: string;
  status: string;
  signedAt: string | null;
};

export type SignerSuggestion = {
  kind: SignerKind;
  name: string;
  email: string;
  learnerId: string | null;
};

type Row = { kind: SignerKind; name: string; email: string; learnerId: string | null };

export function SignaturePanel({
  documentId,
  suggestions,
  existing,
}: {
  documentId: string;
  suggestions: SignerSuggestion[];
  existing: ExistingSignature[];
}) {
  const router = useRouter();
  const { executeAsync } = useAction(requestSignatures);
  const [rows, setRows] = useState<Row[]>(
    suggestions.length > 0
      ? [{ ...suggestions[0]! }]
      : [{ kind: 'learner', name: '', email: '', learnerId: null }],
  );
  const [sending, setSending] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function update(i: number, patch: Partial<Row>) {
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }
  function addRow() {
    setRows((prev) => [...prev, { kind: 'company_rep', name: '', email: '', learnerId: null }]);
  }
  function removeRow(i: number) {
    setRows((prev) => prev.filter((_, idx) => idx !== i));
  }

  async function send() {
    setError(null);
    setMsg(null);
    const signers = rows
      .filter((r) => r.name.trim() && r.email.trim())
      .map((r) => ({ kind: r.kind, name: r.name.trim(), email: r.email.trim(), learnerId: r.learnerId }));
    if (signers.length === 0) {
      setError('Renseignez au moins un signataire (nom + email).');
      return;
    }
    setSending(true);
    const res = await executeAsync({ documentId, signers });
    setSending(false);
    const out = res?.data;
    if (out?.ok) {
      setMsg(`${out.sent}/${out.total} invitation(s) envoyée(s).`);
      router.refresh();
    } else {
      setError(out?.error === 'forbidden_not_admin' ? "Réservé aux administrateurs." : "L'envoi a échoué.");
    }
  }

  return (
    <div className="space-y-5">
      {existing.length > 0 && (
        <div className="space-y-2">
          <p className="text-[11px] uppercase tracking-wider text-zinc-500">Signatures</p>
          <ul className="space-y-1.5">
            {existing.map((s, i) => (
              <li
                key={i}
                className="flex items-center justify-between gap-3 text-[13px] bg-zinc-50 dark:bg-zinc-900 rounded-md px-3 py-2"
              >
                <span className="min-w-0 truncate">
                  {s.signerName ?? s.signerEmail ?? '—'}{' '}
                  <span className="text-[11px] text-zinc-400">
                    · {SIGNER_KIND_LABELS[s.signerKind as SignerKind] ?? s.signerKind}
                  </span>
                </span>
                <StatusBadge status={s.status} />
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="space-y-2">
        <p className="text-[11px] uppercase tracking-wider text-zinc-500">Demander une signature</p>
        {rows.map((r, i) => (
          <div key={i} className="flex flex-col sm:flex-row gap-2">
            <select
              value={r.kind}
              onChange={(e) => update(i, { kind: e.target.value as SignerKind })}
              className="bg-zinc-50 dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-md px-2 py-2 text-[13px] sm:w-44"
            >
              {SIGNER_KINDS.map((k) => (
                <option key={k} value={k}>
                  {SIGNER_KIND_LABELS[k]}
                </option>
              ))}
            </select>
            <input
              value={r.name}
              onChange={(e) => update(i, { name: e.target.value })}
              placeholder="Nom"
              className="flex-1 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-md px-3 py-2 text-[13px]"
            />
            <input
              value={r.email}
              onChange={(e) => update(i, { email: e.target.value, learnerId: null })}
              placeholder="email@exemple.com"
              type="email"
              className="flex-1 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-md px-3 py-2 text-[13px]"
            />
            {rows.length > 1 && (
              <button
                type="button"
                onClick={() => removeRow(i)}
                aria-label="Retirer"
                className="text-zinc-400 hover:text-red-600 px-2"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        ))}

        <div className="flex items-center justify-between pt-1">
          <button
            type="button"
            onClick={addRow}
            className="text-[12px] text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 inline-flex items-center gap-1.5"
          >
            <Plus className="w-3.5 h-3.5" />
            Ajouter un signataire
          </button>
          <button
            type="button"
            onClick={send}
            disabled={sending}
            className="bg-violet-600 hover:bg-violet-700 disabled:opacity-40 text-white text-[13px] font-medium px-4 py-2 rounded-md inline-flex items-center gap-2 shadow-sm"
          >
            {sending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
            Envoyer
          </button>
        </div>
        {msg && <p className="text-[12px] text-emerald-600">{msg}</p>}
        {error && <p className="text-[12px] text-red-600">{error}</p>}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  if (status === 'signed')
    return (
      <span className="text-[11px] text-emerald-600 inline-flex items-center gap-1 flex-shrink-0">
        <CheckCircle2 className="w-3.5 h-3.5" /> Signé
      </span>
    );
  if (status === 'declined' || status === 'expired')
    return (
      <span className="text-[11px] text-red-500 inline-flex items-center gap-1 flex-shrink-0">
        <XCircle className="w-3.5 h-3.5" /> {status === 'declined' ? 'Refusé' : 'Expiré'}
      </span>
    );
  return (
    <span className="text-[11px] text-amber-600 inline-flex items-center gap-1 flex-shrink-0">
      <Clock className="w-3.5 h-3.5" /> En attente
    </span>
  );
}
