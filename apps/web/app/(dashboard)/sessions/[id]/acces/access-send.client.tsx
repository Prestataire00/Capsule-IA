'use client';

import { useAction } from 'next-safe-action/hooks';
import { Loader2, KeyRound, CheckCircle2 } from 'lucide-react';
import { Button } from '@/shared/ui/button';
import { sendSessionAccess } from '../session-actions';

const ERR: Record<string, string> = {
  session_not_found: 'Session introuvable.',
  public_app_url_missing: "L'URL publique de l'application n'est pas configurée.",
};

export function AccessSend({ sessionId, learnerCount }: { sessionId: string; learnerCount: number }) {
  const send = useAction(sendSessionAccess);
  const res = send.result?.data;
  const err = res && !res.ok ? ERR[res.error] ?? res.error : send.result?.serverError ? 'Erreur serveur.' : null;

  return (
    <div className="flex items-center gap-3">
      <Button
        type="button"
        variant="brand"
        disabled={send.isExecuting || learnerCount === 0}
        onClick={() => send.execute({ sessionId })}
      >
        {send.isExecuting ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}
        Générer et envoyer les accès à tous ({learnerCount})
      </Button>
      {res?.ok && (
        <span className="inline-flex items-center gap-1.5 text-[13px] text-emerald-600 dark:text-emerald-400">
          <CheckCircle2 className="w-4 h-4" /> {res.sent} envoyé(s){res.skipped ? `, ${res.skipped} ignoré(s)` : ''}.
        </span>
      )}
      {err && <span className="text-[13px] text-rose-600 dark:text-rose-400">{err}</span>}
    </div>
  );
}
