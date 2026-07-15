'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAction } from 'next-safe-action/hooks';
import { ChevronDown, Loader2, AlertCircle, ArrowRight } from 'lucide-react';
import { StatusPill, dossierStatusTone, dossierStatusLabel } from '@/shared/ui/status-pill';
import type { DossierStatus } from '@/features/dossier/domain/value-objects/dossier-status';
import { STATUS_REACHABLE, actionLabel, primaryNextStatus } from '@/features/dossier/status-transitions';
import { changeDossierStatus } from './status-actions';

export function DossierStatusControl({
  dossierId,
  status,
  compact = false,
}: {
  dossierId: string;
  status: DossierStatus;
  compact?: boolean;
}) {
  const router = useRouter();
  const { executeAsync } = useAction(changeDossierStatus);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<{ msg: string; qualiopi: boolean } | null>(null);

  const reachable = STATUS_REACHABLE[status] ?? [];
  const primary = primaryNextStatus(status);
  const menuOptions = reachable.filter((s) => s !== primary || compact);

  async function go(to: DossierStatus, e?: React.MouseEvent) {
    e?.preventDefault();
    e?.stopPropagation();
    setOpen(false);
    setError(null);
    setLoading(true);
    const res = await executeAsync({ dossierId, to });
    setLoading(false);
    const out = res?.data;
    if (out?.ok) {
      router.refresh();
      return;
    }
    // Blocage partiel : le statut a avancé jusqu'à une étape valide → on
    // rafraîchit pour le refléter, tout en affichant ce qui reste à débloquer.
    if (out && 'advanced' in out && out.advanced) router.refresh();
    if (out?.error === 'blocked') setError({ msg: out.message ?? 'Transition bloquée.', qualiopi: true });
    else if (out?.error === 'forbidden')
      setError({ msg: 'Action non autorisée (dossier verrouillé ou droits insuffisants).', qualiopi: false });
    else if (out?.error === 'invalid_transition')
      setError({ msg: 'Transition non permise depuis ce statut.', qualiopi: false });
    else setError({ msg: 'Échec du changement de statut.', qualiopi: false });
  }

  const toggle = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setOpen((v) => !v);
    setError(null);
  };

  // Statut terminal (archivé / annulé) : simple pastille, pas d'action.
  if (reachable.length === 0) {
    return <StatusPill tone={dossierStatusTone(status)}>{dossierStatusLabel(status)}</StatusPill>;
  }

  return (
    <span className="relative inline-flex items-center gap-2">
      {/* Pastille + chevron : ouvre le menu de tous les statuts atteignables */}
      <button type="button" onClick={toggle} className="inline-flex items-center gap-1 group" title="Changer le statut">
        <StatusPill tone={dossierStatusTone(status)}>{dossierStatusLabel(status)}</StatusPill>
        {loading ? (
          <Loader2 className="w-3 h-3 animate-spin text-zinc-400" />
        ) : (
          <ChevronDown className="w-3 h-3 text-zinc-400 group-hover:text-zinc-600 dark:group-hover:text-zinc-300" />
        )}
      </button>

      {/* Bouton principal « étape suivante » (uniquement en mode non-compact) */}
      {!compact && primary && (
        <button
          type="button"
          onClick={(e) => go(primary, e)}
          disabled={loading}
          className="inline-flex items-center gap-1.5 bg-violet-600 hover:bg-violet-700 disabled:opacity-40 text-white text-[12px] font-medium px-3 py-1.5 rounded-lg shadow-sm transition"
        >
          <ArrowRight className="w-3.5 h-3.5" />
          {actionLabel(status, primary)}
        </button>
      )}

      {open && (
        <>
          <button
            type="button"
            aria-hidden
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setOpen(false);
            }}
            className="fixed inset-0 z-40 cursor-default"
          />
          <div className="absolute left-0 top-full mt-1.5 z-50 min-w-[220px] bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-lg shadow-xl py-1">
            <p className="px-3 py-1.5 text-[10px] uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
              Changer le statut
            </p>
            {menuOptions.map((to) => (
              <button
                key={to}
                type="button"
                onClick={(e) => go(to, e)}
                className="w-full text-left px-3 py-2 text-[13px] text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-950 inline-flex items-center gap-2"
              >
                <StatusPill tone={dossierStatusTone(to)}>{dossierStatusLabel(to)}</StatusPill>
                <span className="text-zinc-500 dark:text-zinc-400">{actionLabel(status, to)}</span>
              </button>
            ))}
          </div>
        </>
      )}

      {error && (
        <span className="absolute left-0 top-full mt-1.5 z-50 min-w-[240px] max-w-[320px] bg-white dark:bg-zinc-900 border border-red-200/60 dark:border-red-900/40 rounded-lg shadow-xl p-3">
          <span className="flex items-start gap-2 text-[12px] text-red-600 dark:text-red-400">
            <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <span>
              {error.msg}
              {error.qualiopi && (
                <>
                  {' '}
                  <Link
                    href={`/dossiers/${dossierId}/qualiopi`}
                    className="underline font-medium"
                    onClick={(e) => e.stopPropagation()}
                  >
                    Voir les indicateurs Qualiopi
                  </Link>
                </>
              )}
            </span>
          </span>
        </span>
      )}
    </span>
  );
}
