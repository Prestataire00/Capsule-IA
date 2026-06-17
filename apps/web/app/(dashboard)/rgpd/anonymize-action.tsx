'use client';

import { useState, useTransition } from 'react';
import { ShieldX, Loader2 } from 'lucide-react';
import { Button } from '@/shared/ui/button';
import { anonymizeLearner, anonymizeProspect } from './rgpd-actions';
import { namesMatch } from './name-match';

type Subject =
  | { kind: 'learner'; id: string; lastName: string }
  | { kind: 'prospect'; id: string; lastName: string };

const ERR_MESSAGES: Record<string, string> = {
  forbidden_not_admin: 'Réservé aux administrateurs.',
  not_found: 'Introuvable.',
  active_dossier_exists: 'Clôturez ou annulez d’abord le(s) dossier(s) en cours.',
  name_mismatch: 'Le nom saisi ne correspond pas.',
};

export function AnonymizeAction({ subject }: { subject: Subject }) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const run = () => {
    setError(null);
    startTransition(async () => {
      const res =
        subject.kind === 'learner'
          ? await anonymizeLearner({ learnerId: subject.id, confirmName: typed })
          : await anonymizeProspect({ prospectId: subject.id, confirmName: typed });
      const data = res?.data;
      if (data?.ok) {
        window.location.reload();
      } else {
        setError(ERR_MESSAGES[data?.error ?? 'not_found'] ?? 'Échec de l’anonymisation.');
      }
    });
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="text-[12px] text-red-600 dark:text-red-400 hover:underline inline-flex items-center gap-1"
        title="Droit à l’effacement RGPD"
      >
        <ShieldX className="w-3 h-3" />
        Anonymiser (RGPD)
      </button>
    );
  }

  return (
    <div className="space-y-2 rounded-lg border border-red-200 dark:border-red-900/50 p-3 bg-red-50/50 dark:bg-red-950/20">
      <p className="text-[12px] text-red-700 dark:text-red-300">
        Action <strong>irréversible</strong>. Les identifiants directs seront effacés ; les preuves
        légales (émargements, conventions signées) sont conservées pseudonymisées.
        Saisissez le nom <strong>{subject.lastName}</strong> pour confirmer.
      </p>
      <input
        value={typed}
        onChange={(e) => setTyped(e.target.value)}
        placeholder="Nom de famille"
        className="w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2 py-1 text-[13px]"
      />
      <div className="flex items-center gap-2">
        <Button onClick={run} disabled={pending || !namesMatch(typed, subject.lastName)} variant="danger">
          {pending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
          Anonymiser définitivement
        </Button>
        <Button onClick={() => setOpen(false)} variant="secondary" disabled={pending}>
          Annuler
        </Button>
      </div>
      {error && <p className="text-[12px] text-red-600">{error}</p>}
    </div>
  );
}
