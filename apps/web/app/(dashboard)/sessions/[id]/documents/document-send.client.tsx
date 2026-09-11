'use client';

import { useState } from 'react';
import { useAction } from 'next-safe-action/hooks';
import { Loader2, Send, CheckCircle2 } from 'lucide-react';
import { FormField, inputClass } from '@/shared/ui/form-field';
import { Button } from '@/shared/ui/button';
import { sendDocumentToSession } from '../session-actions';

const KINDS: { value: string; label: string }[] = [
  { value: 'convention', label: 'Convention de formation' },
  { value: 'attestation', label: 'Attestation de fin de formation' },
  { value: 'certificat', label: 'Certificat de réalisation' },
  { value: 'programme', label: 'Programme' },
];

const ERROR_LABELS: Record<string, string> = {
  session_not_found: 'Session introuvable.',
};

export function DocumentSessionForm({ sessionId, learnerCount }: { sessionId: string; learnerCount: number }) {
  const [kind, setKind] = useState('convention');
  const send = useAction(sendDocumentToSession);

  const res = send.result?.data;
  const err = res && !res.ok ? ERROR_LABELS[res.error] ?? res.error : send.result?.serverError ? 'Erreur serveur.' : null;

  return (
    <div className="bg-white dark:bg-zinc-900 border border-zinc-200/70 dark:border-zinc-800 rounded-xl shadow-sm p-5 space-y-4 max-w-xl">
      <FormField
        label="Envoyer un document à tous les apprenants de la session"
        hint="Chaque apprenant reçoit son propre document (le dernier généré de ce type dans son dossier). Ceux sans document sont ignorés."
      >
        <select className={inputClass} value={kind} onChange={(e) => setKind(e.target.value)}>
          {KINDS.map((k) => (
            <option key={k.value} value={k.value}>
              {k.label}
            </option>
          ))}
        </select>
      </FormField>

      <div className="flex items-center gap-3">
        <Button
          type="button"
          variant="brand"
          disabled={send.isExecuting || learnerCount === 0}
          onClick={() => send.execute({ sessionId, kind })}
        >
          {send.isExecuting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          Envoyer à tous ({learnerCount})
        </Button>
        {res?.ok && (
          <span className="inline-flex items-center gap-1.5 text-[13px] text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="w-4 h-4" /> {res.sent} envoyé(s){res.skipped ? `, ${res.skipped} ignoré(s)` : ''}.
          </span>
        )}
        {err && <span className="text-[13px] text-rose-600 dark:text-rose-400">{err}</span>}
      </div>
    </div>
  );
}
