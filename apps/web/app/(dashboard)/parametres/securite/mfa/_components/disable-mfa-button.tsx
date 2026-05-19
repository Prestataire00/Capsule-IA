'use client';

import { useState, useTransition } from 'react';
import { ShieldOff, Loader2 } from 'lucide-react';
import { Button } from '@/shared/ui/button';
import { disableMfaAction } from '../actions';

export function DisableMfaButton({ factorId }: { factorId: string }) {
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const handleDisable = () => {
    setError(null);
    startTransition(async () => {
      const result = await disableMfaAction({ factorId });
      if (result.ok) {
        window.location.reload();
      } else {
        setError(result.error);
      }
    });
  };

  if (!confirm) {
    return (
      <button
        onClick={() => setConfirm(true)}
        className="text-[12px] text-red-600 dark:text-red-400 hover:underline inline-flex items-center gap-1"
      >
        <ShieldOff className="w-3 h-3" />
        Désactiver la MFA
      </button>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-[13px] text-red-700 dark:text-red-300">
        Confirmer la désactivation ? Cette action sera auditée et les owners de votre OF seront notifiés.
      </p>
      <div className="flex items-center gap-2">
        <Button onClick={handleDisable} disabled={pending} variant="danger">
          {pending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
          Confirmer la désactivation
        </Button>
        <Button onClick={() => setConfirm(false)} variant="secondary" disabled={pending}>
          Annuler
        </Button>
      </div>
      {error && <p className="text-[12px] text-red-600">{error}</p>}
    </div>
  );
}
