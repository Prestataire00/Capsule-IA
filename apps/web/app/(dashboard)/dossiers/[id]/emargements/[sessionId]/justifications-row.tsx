'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Check, ExternalLink, Paperclip, X } from 'lucide-react';
import { DECISION_LABELS } from '@/features/attendance/justification-rules';
import { attendanceErrorLabel } from '@/features/attendance/schemas';
import type { JustificationView } from '@/features/attendance/queries/load-session-emargement';
import { decideJustification } from './actions';

const TON: Record<string, string> = {
  en_attente: 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300',
  acceptee: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300',
  refusee: 'bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300',
};

const date = (iso: string) =>
  new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' }).format(new Date(iso));

/** Justificatifs d'un apprenant sur une feuille : ouvrir, accepter, refuser. */
export function JustificationsRow({ items }: { items: readonly JustificationView[] }) {
  const router = useRouter();
  const [erreur, setErreur] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const decider = (id: string, decision: 'acceptee' | 'refusee') =>
    start(async () => {
      setErreur(null);
      setInfo(null);
      const r = await decideJustification({ id, decision });
      if (!r.ok) return setErreur(attendanceErrorLabel(r.error));
      if (decision === 'acceptee') {
        setInfo(r.marked ? 'Absence notée « excusée ».' : 'Justificatif accepté ; la feuille (clôturée ou signée) reste inchangée.');
      }
      router.refresh();
    });

  return (
    <div className="mt-1.5 space-y-1">
      {items.map((j) => (
        <div key={j.id} className="flex flex-wrap items-center gap-2 text-[12px]">
          <Paperclip className="w-3.5 h-3.5 text-zinc-400" aria-hidden />
          <a
            href={`/api/attendance/justifications/${j.id}`}
            target="_blank"
            rel="noopener"
            className="text-zinc-700 dark:text-zinc-300 underline decoration-zinc-300 underline-offset-2 hover:text-zinc-900 inline-flex items-center gap-1"
          >
            {j.fileName}
            <ExternalLink className="w-3 h-3" aria-hidden />
          </a>
          <span className="text-zinc-400">
            {j.via === 'apprenant' ? 'envoyé par l’apprenant' : 'déposé par l’équipe'} · {date(j.createdAt)}
          </span>
          <span className={`px-2 py-0.5 rounded-full text-[11px] ${TON[j.decision] ?? TON.en_attente}`}>{DECISION_LABELS[j.decision] ?? j.decision}</span>
          {j.comment && <span className="text-zinc-500 italic">« {j.comment} »</span>}
          {j.decision === 'en_attente' && (
            <>
              <button
                type="button"
                disabled={pending}
                onClick={() => decider(j.id, 'acceptee')}
                className="inline-flex items-center gap-1 px-2 py-1 min-h-7 rounded-md text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 disabled:opacity-40"
              >
                <Check className="w-3.5 h-3.5" /> Accepter
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() => decider(j.id, 'refusee')}
                className="inline-flex items-center gap-1 px-2 py-1 min-h-7 rounded-md text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 disabled:opacity-40"
              >
                <X className="w-3.5 h-3.5" /> Refuser
              </button>
            </>
          )}
        </div>
      ))}
      {erreur && <p role="alert" className="text-[12px] text-red-600 dark:text-red-400">{erreur}</p>}
      {info && <p role="status" className="text-[12px] text-emerald-700 dark:text-emerald-400">{info}</p>}
    </div>
  );
}
