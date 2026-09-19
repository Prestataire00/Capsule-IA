'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAction } from 'next-safe-action/hooks';
import { Loader2, Plus, Send, Trash2 } from 'lucide-react';
import { StatusPill } from '@/shared/ui/status-pill';
import { ACCENTS } from '@/shared/ui/kpi-card';
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

const AVATARS = [
  'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300',
  'bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300',
  'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300',
  'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300',
  'bg-purple-100 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300',
];

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
          <p className="text-[11px] font-bold uppercase tracking-[0.06em] text-zinc-500 dark:text-zinc-400 flex items-center gap-2">
            Signatures
            <span className={`text-[11px] font-bold tabular-nums normal-case tracking-normal px-2 py-0.5 rounded-full ${ACCENTS.emerald.soft}`}>
              {existing.filter((s) => s.status === 'signed').length}/{existing.length}
            </span>
          </p>
          <ul className="space-y-1.5">
            {existing.map((s, i) => {
              const who = s.signerName ?? s.signerEmail ?? '—';
              return (
              <li
                key={i}
                className="flex items-center justify-between gap-3 text-[13px] bg-zinc-50 dark:bg-zinc-950/40 border border-zinc-200/70 dark:border-zinc-800 rounded-lg px-3 py-2.5"
              >
                <span className="min-w-0 flex items-center gap-2.5">
                  <span className={`w-7 h-7 rounded-full grid place-items-center text-[11px] font-bold shrink-0 ${AVATARS[(who.charCodeAt(0) || 0) % AVATARS.length]}`}>
                    {who.split(/[\s@.]+/).filter(Boolean).map((p) => p[0]).join('').slice(0, 2).toUpperCase()}
                  </span>
                  <span className="min-w-0 truncate font-bold text-zinc-900 dark:text-zinc-100">
                    {who}{' '}
                    <span className="text-[12px] font-normal text-zinc-500">
                      · {SIGNER_KIND_LABELS[s.signerKind as SignerKind] ?? s.signerKind}
                    </span>
                  </span>
                </span>
                <StatusBadge status={s.status} />
              </li>
              );
            })}
          </ul>
        </div>
      )}

      <div className="space-y-2">
        <p className="text-[11px] font-bold uppercase tracking-[0.06em] text-zinc-500 dark:text-zinc-400">Demander une signature</p>
        {rows.map((r, i) => (
          <div key={i} className="flex flex-col sm:flex-row gap-2">
            <select
              value={r.kind}
              onChange={(e) => update(i, { kind: e.target.value as SignerKind })}
              className="h-9 bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800 rounded-lg transition focus:outline-none focus:border-orange-300 dark:focus:border-orange-800 focus:ring-4 focus:ring-orange-500/10 px-2 text-[13px] sm:w-44"
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
              className="flex-1 h-9 bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800 rounded-lg transition focus:outline-none focus:border-orange-300 dark:focus:border-orange-800 focus:ring-4 focus:ring-orange-500/10 px-3 text-[13px]"
            />
            <input
              value={r.email}
              onChange={(e) => update(i, { email: e.target.value, learnerId: null })}
              placeholder="email@exemple.com"
              type="email"
              className="flex-1 h-9 bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800 rounded-lg transition focus:outline-none focus:border-orange-300 dark:focus:border-orange-800 focus:ring-4 focus:ring-orange-500/10 px-3 text-[13px]"
            />
            {rows.length > 1 && (
              <button
                type="button"
                onClick={() => removeRow(i)}
                aria-label="Retirer"
                className="w-9 h-9 rounded-md grid place-items-center text-zinc-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40 transition"
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
            className="bg-orange-500 hover:bg-orange-600 disabled:opacity-40 text-white text-[13px] font-semibold px-4 h-9 rounded-lg transition inline-flex items-center gap-2 shadow-sm shadow-orange-600/30 ring-1 ring-inset ring-white/10"
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
  if (status === 'signed') return <StatusPill tone="success">Signé</StatusPill>;
  if (status === 'declined' || status === 'expired')
    return <StatusPill tone="danger">{status === 'declined' ? 'Refusé' : 'Expiré'}</StatusPill>;
  return <StatusPill tone="warning">En attente</StatusPill>;
}
